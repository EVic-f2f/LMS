const crypto = require("crypto");

function legacyIdToUuid(value) {
  const digest = crypto.createHash("md5").update(String(value)).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

module.exports = { legacyIdToUuid };
