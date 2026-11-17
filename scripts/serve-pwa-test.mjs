// Local-only fixture: exercise the built PWA and a genuine service-worker update.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
let release = 1;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf' };

createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/__test/advance' && request.method === 'POST') {
    release++;
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ release }));
    return;
  }
  if (path.startsWith('/api/')) {
    response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"message":"No autenticado"}');
    return;
  }
  const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    let content = await readFile(file);
    if (path === '/sw.js') content = Buffer.concat([content, Buffer.from(`\n// fixture release ${release}\n`)]);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' }).end(content);
  } catch {
    if (!extname(path)) {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(await readFile(resolve(root, 'index.html')));
    } else response.writeHead(404).end();
  }
}).listen(4174, '127.0.0.1', () => process.stdout.write('PWA test server ready\n'));
