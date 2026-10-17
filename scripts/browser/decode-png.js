// Decodes a base64 PNG data URI (or bare base64) and prints IHDR info.
// Usage: node scripts/browser/decode-png.js <base64-or-data-uri>
import zlib from "node:zlib";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node decode-png.js <base64-or-data-uri>");
  process.exit(1);
}

const raw = args[0].startsWith("data:") ? args[0].split(",")[1] : args[0];
const png = Buffer.from(raw, "base64");

// Find IDAT chunks (skip IHDR, which is always 25 bytes: 8 sig + 4 len + 4 type + 8 IHDR data).
const offset = png.indexOf(Buffer.from("IDAT"));
const idatLen = png.readUInt32BE(offset + 4);
const idat = png.slice(offset + 8, offset + 8 + idatLen);
const rawScanlines = zlib.inflateSync(idat);

// Parse IHDR (first 8 bytes of the first IDAT fragment that survived inflation).
const width = rawScanlines.readUInt32BE(0);
const height = rawScanlines.readUInt32BE(4);
const bitdepth = rawScanlines[8];
const colortype = rawScanlines[9];

const ctNames = { 0: "grayscale", 2: "RGB", 3: "palette", 4: "grayscale+alpha", 6: "RGBA" };
const bdNames = { 1: "1 bit", 2: "2 bits", 4: "4 bits", 8: "8 bits", 16: "16 bits" };

console.log(`IHDR: width=${width} height=${height} bitdepth=${bitdepth} (${bdNames[bitdepth]}) colortype=${colortype} (${ctNames[colortype]})`);
console.log(`pieces: ${rawScanlines.length} IDAT fragments, total decompressed ${rawScanlines.length} fragments`);

// Sanity: colour-type 2 / 6 PNGs must have 8-bit linear RGBA scanlines; a data-URI
// labelled `image/png` but carrying a different colortype violates the on-the-wire
// contract the app's `data:image/png` markup assumes.
console.log(`expectedScanlineBytes: ${((colortype === 2 || colortype === 6 ? 4 : 1) * (width * bitdepth / 8) + 1) * height}`);
console.log(`actualDecompressedBytes: ${rawScanlines.length}`);
console.log(`webp-sign: ${png.slice(0, 4).toString("hex")}`); // 52504657 = "RPWV" for WebP
