const net = require("net");
const singleton = require("./Singleton");
const kadPTP = require("./kadPTP");

// Create the server
const server = net.createServer();

singleton.init();

const args = process.argv.slice(2); // Remove the first two elements
let peerName, peerIP, peerPort;
let listenPort = 0;

// A global dht for each instance of peer, initially empty
const dht = {
  ownerID: null,
  kBuckets: Array(32)
    .fill(null)
    .map(() => []),
};

if (args[0] === "-n" && args[1]) {
  peerName = args[1];
} else {
  console.error("Peer name (-n) is required.");
  process.exit(1);
}

if (args[2] === "-p" && args[3]) {
  [peerIP, peerPort] = args[3].split(":");
  const client = new net.Socket();

  client.connect({ host: peerIP, port: peerPort }, () => {
    listenPort = client.localPort;
    console.log(listenPort);
    const localAddress = client.localAddress;
    const localPort = client.localPort;
    const peerID = singleton.getPeerID(localAddress, localPort);
    dht.ownerID = peerID;
    console.log(
      `Connected to peer1:${peerPort} at timestamp: ${singleton.getTimestamp()}`
    );
    console.log(
      `This peer is ${localAddress}:${localPort} located at peer2 [${peerID}]`
    );
  });

  client.on("data", (data) => {
    const packet = parseIncomingPacket(data);

    const senderName = parseSenderName(
      data,
      packet.numberOfPeers,
      packet.senderNameLength
    );
    // Check version number
    if (packet.version !== 9) {
      console.log("Packet ignored due to version mismatch.");
      return;
    }
    // Check message type
    if (packet.messageType === 1) {
      const serverID = singleton.getPeerID(peerIP, peerPort);
      console.log(
        `Received Welcome Message from server ${serverID} along with DHT`
      );
      if (packet.numberOfPeers == 0) {
        console.log([]);
      }
      packet.peers.forEach((peer) => {
        const peerID = singleton.getPeerID(peer.ip, peer.port);
        console.log(`[${peer.ip}:${peer.port}, ${peerID}]`);
      });
      // Add the server to the client's DHT
      const peerInfo = {
        id: singleton.getPeerID(peerIP, peerPort),
        address: peerIP,
        port: peerPort,
      };
      pushBucket(dht, peerInfo);

      // Run refresh buckets after reading the message
      refreshBuckets(dht, packet.peers);

      sendHello(dht);
    }

    if (packet.messageType === 2) {
      console.log(`Received Hello Message from ${senderName} along with DHT`);
      packet.peers.forEach((peer) => {
        const peerID = singleton.getPeerID(peer.ip, peer.port);
        console.log(`[${peer.ip}:${peer.port}, ${peerID}]`);
      });
    }
  });
}
server.listen(listenPort, () => {
  console.log(listenPort);
  const address = server.address();
  const displayAddress =
    address.address === "::" ? "127.0.0.1" : address.address;
  const ownerID = singleton.getPeerID(displayAddress, address.port);
  console.log(
    `This peer address is ${displayAddress}:${address.port} located at ${peerName} [${ownerID}]`
  );
  dht.ownerID = ownerID;
});

server.on("connection", (socket) => {
  let dataReceived = false;
  let timeout = setTimeout(() => {
    if (!dataReceived) {
      handleClientJoin(socket);
    }
  }, 2000);
  socket.on("data", (data) => {
    clearTimeout(timeout);
    dataReceived = true;
    const packet = parseIncomingPacket(data);

    const senderName = parseSenderName(
      data,
      packet.numberOfPeers,
      packet.senderNameLength
    );
    // Check version number
    if (packet.version !== 9) {
      console.log("Packet ignored due to version mismatch.");
      return socket.end();
    }
    // Check message type
    if (packet.messageType === 2) {
      console.log(`Received Hello Message from ${senderName} along with DHT`);
      packet.peers.forEach((peer) => {
        const peerID = singleton.getPeerID(peer.ip, peer.port);
        console.log(`[${peer.ip}:${peer.port}, ${peerID}]`);
      });
      // Add the server to the client's DHT
      peerInfo = {
        id: singleton.getPeerID(peerIP, peerPort),
        address: peerIP,
        port: peerPort,
      };
      // Run refresh buckets after reading the message
      refreshBuckets(dht, packet.peers);
      socket.end();
    }
  });
});

// Function to handle Client joining server
function handleClientJoin(socket) {
  var remoteAddress = socket.remoteAddress;
  var remotePort = socket.remotePort;

  if (remoteAddress.includes("::ffff:")) {
    remoteAddress = remoteAddress.replace("::ffff:", "");
  }

  const peerID = singleton.getPeerID(remoteAddress, remotePort);

  const peerInfo = {
    id: peerID,
    address: remoteAddress,
    port: remotePort,
  };
  const peerData = prepareDHTDataForPacket(dht);

  // Sending a welcome message
  kadPTP.init(9, 1, peerData.length, peerName, peerData);
  const welcomePacket = kadPTP.getBytePacket();

  // Send the welcome packet to the newly connected peer
  socket.write(welcomePacket);
  console.log(`Connected from peer ${remoteAddress}:${remotePort}`);

  pushBucket(dht, peerInfo);

  console.log("My DHT:");
  dht.kBuckets.forEach((bucket, index) => {
    if (bucket.length > 0) {
      bucket.forEach((peer) => {
        console.log(`[ P${index}, ${peer.address}:${peer.port}, ${peer.id}]`);
      });
    }
  });
}

function pushBucket(T, P) {
  const peerID = P.id;
  const ownID = T.ownerID;

  // Convert IDs to binary string for comparison
  const peerIDBinary = singleton.stringToBinary(peerID);
  const ownIDBinary = singleton.stringToBinary(ownID);

  //console.log(peerIDBinary);
  //console.log(ownIDBinary);

  // Determine the maximum number of leftmost bits shared (n)
  let sharedBits = 0;
  for (let i = 0; i < peerIDBinary.length; i++) {
    if (peerIDBinary[i] === ownIDBinary[i]) sharedBits++;
    else break;
  }

  // n is the index of the k-bucket
  const n = sharedBits;

  // DHT.kBuckets is an array of buckets, where each bucket can hold only one peer

  if (!T.kBuckets[n]) {
    console.log("Can't insert itself into DHT");
  } else if (T.kBuckets[n].length === 0) {
    console.log(`Bucket P${n} has no value, adding ${peerID}`);
    T.kBuckets[n].push(P);
  } else {
    console.log(
      `Bucket ${n} is full, checking if we need to change the stored value`
    );
    // If the nth bucket is full, determine which peer (P or N) is closer to P′
    const existingPeerID = T.kBuckets[n][0].id;
    const distanceToExistingPeer = xorDistance(ownID, existingPeerID);
    const distanceToNewPeer = xorDistance(ownID, peerID);

    if (distanceToNewPeer < distanceToExistingPeer) {
      console.log(
        `${peerID} is closer than ${existingPeerID}, therefore we will update.`
      );
      T.kBuckets[n][0] = P; // Insert into bucket
    } else {
      console.log(`Current value is closest, no update needed`);
    }
  }
}

// Helper function to calculate XOR distance between two peer IDs (Needed for Kademlia)
function xorDistance(id1, id2) {
  const bin1 = parseInt(id1, 16).toString(2).padStart(32, "0");
  const bin2 = parseInt(id2, 16).toString(2).padStart(32, "0");
  let distance = "";

  for (let i = 0; i < bin1.length; i++) {
    distance += bin1[i] === bin2[i] ? "0" : "1";
  }

  return parseInt(distance, 2);
}

// Helper function to return integer value of bits from packet
function parseBitPacket(packet, offset, length) {
  let number = "";
  for (var i = 0; i < length; i++) {
    // let us get the actual byte position of the offset
    let bytePosition = Math.floor((offset + i) / 8);
    let bitPosition = 7 - ((offset + i) % 8);
    let bit = (packet[bytePosition] >> bitPosition) % 2;
    number = (number << 1) | bit;
  }
  return number;
}

// Helper function to parse a packet
function parseIncomingPacket(packet) {
  let offset = 0;
  const version = parseBitPacket(packet, offset, 4);
  offset += 4;

  const messageType = parseBitPacket(packet, offset, 7);
  offset += 7;

  const numberOfPeers = parseBitPacket(packet, offset, 9);
  offset += 9;

  const senderNameLength = parseBitPacket(packet, offset, 12);
  offset += 12;

  // Peer table information will follow
  let peers = [];
  for (let i = 0; i < numberOfPeers; i++) {
    // Parse the IP address as a single 4-byte (32-bit) field
    const ip1 = parseBitPacket(packet, offset, 8);
    offset += 8;
    const ip2 = parseBitPacket(packet, offset, 8);
    offset += 8;
    const ip3 = parseBitPacket(packet, offset, 8);
    offset += 8;
    const ip4 = parseBitPacket(packet, offset, 8);
    offset += 8;
    const peerIP = `${ip1}.${ip2}.${ip3}.${ip4}`;

    // Parse the port as a 2-byte (16-bit) field
    const peerPort = parseBitPacket(packet, offset, 16);
    offset += 16;

    // Parse the 2-byte buffer
    const buffer = parseBitPacket(packet, offset, 16);
    offset += 16;

    peers.push({ ip: peerIP, port: peerPort, buffer });
  }

  return {
    version,
    messageType,
    numberOfPeers,
    senderNameLength,
    peers,
  };
}

// Helper function to parse the sender name
function parseSenderName(packet, nPeers, senderNameLength) {
  // Starting position of the sender name in packet
  const senderNameStart = 4 + nPeers * 8; // Each peer takes up 8 bytes
  // Extract the sender name
  const senderName = packet.toString(
    "utf8",
    senderNameStart,
    senderNameStart + senderNameLength
  );
  return senderName;
}

// Helper function to prepare DHT for packet init
function prepareDHTDataForPacket(dht) {
  let peerData = [];

  dht.kBuckets.forEach((bucket) => {
    bucket.forEach((peer) => {
      const dataEntry = `${peer.address}:${peer.port}`;
      peerData.push(dataEntry);
    });
  });

  return peerData;
}

// RefreshBucket function to update its DHT when a packet is recieved
function refreshBuckets(T, peers) {
  peers.forEach((peer) => {
    const peerID = singleton.getPeerID(peer.ip, peer.port);
    const peerInfo = {
      id: peerID,
      address: peer.ip,
      port: peer.port,
    };
    pushBucket(T, peerInfo); // Using pushbucket
  });

  // Display the updated DHT table
  console.log("Refresh k-Bucket operation is performed");
  console.log("My DHT:");
  T.kBuckets.forEach((bucket, index) => {
    if (bucket.length > 0) {
      bucket.forEach((peer) => {
        console.log(`[ P${index}, ${peer.address}:${peer.port}, ${peer.id}]`);
      });
    }
  });
}

// sendHello to all peers in the DHT
function sendHello(T) {
  T.kBuckets.forEach((bucket) => {
    bucket.forEach((peer) => {
      // Client socket for each peer
      const helloClient = new net.Socket();
      helloClient.connect({ host: peer.address, port: peer.port }, () => {
        const peerData = prepareDHTDataForPacket(T);
        kadPTP.init(9, 2, peerData.length, peerName, peerData);
        const helloPacket = kadPTP.getBytePacket();
        helloClient.write(helloPacket, () => {
          helloClient.end();
        });
      });
    });
  });
  console.log("Hello packet has been sent.");
}
