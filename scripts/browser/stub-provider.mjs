// Minimal OpenAI-compatible image provider for the browser harnesses.
//
// Serves POST {PORT}/v1/images/generations with a real (valid) PNG so the app
// can decode and render it. Used by scripts/browser/verify-flow.mjs.
import http from 'node:http';
import zlib from 'node:zlib';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function makePng(w, h, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour RGB
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x += 1) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const PNG_B64 = makePng(64, 48, 90, 120, 200).toString('base64');
const port = Number(process.env.PORT || 8099);

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = req.url || '';
      if (url.includes('/images/generations')) {
        let prompt = '';
        try {
          prompt = JSON.parse(body || '{}').prompt || '';
        } catch {
          /* ignore */
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ created: Math.floor(Date.now() / 1000), data: [{ b64_json: PNG_B64, revised_prompt: `stub(${prompt})` }] }));
      } else {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'stub provider: no such endpoint' } }));
      }
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`stub provider on http://127.0.0.1:${port}`));
