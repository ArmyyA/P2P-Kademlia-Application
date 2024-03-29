const crypto = require("crypto");

let sequenceNumber;
let timerInterval = 10;
let timer;

function timerRun() {
  timer++;
  if (timer == 4294967295) {
    timer = Math.floor(1000 * Math.random()); // reset timer to be within 32 bit size
  }
}

module.exports = {
  init: function () {
    timer = Math.floor(1000 * Math.random()); /* any random number */
    setInterval(timerRun, timerInterval);
    sequenceNumber = Math.floor(1000 * Math.random()); /* any random number */
  },

  //--------------------------
  //getSequenceNumber: return the current sequence number + 1
  //--------------------------
  getSequenceNumber: function () {
    sequenceNumber++;
    return sequenceNumber;
  },

  //--------------------------
  //getTimestamp: return the current timer value
  //--------------------------
  getTimestamp: function () {
    return timer;
  },

  //--------------------------
  //getPeerID: takes the IP and port number and returns 4 bytes Hex number
  //--------------------------
  getPeerID: function (IP, port) {
    return crypto
      .createHash("shake256", { outputLength: 4 }) // 4 bytes
      .update(IP + ":" + port) // IP and port as input string
      .digest("hex"); // Output hex
  },

  //--------------------------
  //Hex2Bin: convert Hex string into binary string
  //--------------------------
  Hex2Bin: function (hex) {
    var bin = "";
    hex.split("").forEach((str) => {
      bin += parseInt(str, 16).toString(2).padStart(4, "0");
    });
    return bin;
  },

  stringToBinary: function (inputString) {
    let binaryString = "";
    for (let i = 0; i < inputString.length; i++) {
      const charCode = inputString.charCodeAt(i); // Get the character code of each character
      const binaryChar = charCode.toString(2).padStart(8, "0"); // Convert to binary and pad to 8 bits
      binaryString += binaryChar + " "; // Add a space between bytes for readability (optional)
    }
    return binaryString.trim(); // Trim any trailing space
  },

  //--------------------------
  //XORing: finds the XOR of the two Binary Strings with the same size
  //--------------------------
  XORing: function (a, b) {
    let ans = "";
    for (let i = 0; i < a.length; i++) {
      // If the Character matches
      if (a[i] == b[i]) ans += "0";
      else ans += "1";
    }
    return ans;
  },
};
