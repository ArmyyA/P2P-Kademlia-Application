//size of the packet header:
var HEADER_SIZE = 4;

var version;

module.exports = {
  packet: null,

  init: function (
    ver, // ITP version
    msgType, // message type
    nPeers, // number of peers
    sName, // length of sender name
    peerData // data from the peer
  ) {
    //fill by default packet fields:
    version = ver;

    //build the header bistream:
    //--------------------------
    this.packet = Buffer.alloc(
      HEADER_SIZE + Buffer.byteLength(sName, "utf8") + nPeers * 8
    ); // number of peers where each peer takes up 8 bytes

    //fill out the header array of byte
    // Version and Message Type
    storeBitPacket(this.packet, version, 0, 4);
    storeBitPacket(this.packet, msgType, 4, 7);

    // Number of peers
    storeBitPacket(this.packet, nPeers, 11, 9);

    // sender name length
    const sNameLength = Buffer.byteLength(sName, "utf8");
    storeBitPacket(this.packet, sNameLength, 20, 12);

    // Offset for packet content
    let offset = HEADER_SIZE;

    // Adding peer data for each peer (4-byte IP + 2-byte port + 2-byte buffer)

    peerData.forEach((data, index) => {
      const [ip, port] = data.split(":");
      const ipBuffer = ip.split(".").map((octet) => parseInt(octet, 10));
      ipBuffer.forEach((octet, i) => {
        this.packet[offset + i] = octet;
      });
      offset += 4;

      const portNumber = parseInt(port, 10);
      this.packet.writeUInt16BE(portNumber, offset);
      offset += 2;

      // 2-byte buffer follows the port

      offset += 2;
    });
    this.packet.write(sName, offset, "utf8");
  },

  //--------------------------
  //getBytePacket: returns the entire packet in bytes
  //--------------------------
  getBytePacket: function () {
    return this.packet;
  },
};

// Helper function from assignment 1 sample solution
// Store integer value into the packet bit stream
function storeBitPacket(packet, value, offset, length) {
  // let us get the actual byte position of the offset
  let lastBitPosition = offset + length - 1;
  let number = value.toString(2);
  let j = number.length - 1;
  for (var i = 0; i < number.length; i++) {
    let bytePosition = Math.floor(lastBitPosition / 8);
    let bitPosition = 7 - (lastBitPosition % 8);
    if (number.charAt(j--) == "0") {
      packet[bytePosition] &= ~(1 << bitPosition);
    } else {
      packet[bytePosition] |= 1 << bitPosition;
    }
    lastBitPosition--;
  }
}
