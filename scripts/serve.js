'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(path.resolve(__dirname, '..'));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };
const port = Number(process.env.PORT || 4173);

function allowed(file) {
  const relative = path.relative(root, file);
  return !relative.split(path.sep).some(part => part.startsWith('.')) &&
    (['index.html', 'sitemap.xml'].includes(relative) || relative.startsWith('site' + path.sep));
}

const server = http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (name.includes('\0')) { res.writeHead(400).end('Bad request'); return; }
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!allowed(file)) {
    res.writeHead(404).end('Not found'); return;
  }
  fs.realpath(file, (error, resolved) => {
    if (error || !allowed(resolved)) { res.writeHead(404).end('Not found'); return; }
    fs.readFile(resolved, (error, data) => {
      if (error) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + (['.html', '.css', '.js', '.txt'].includes(path.extname(file)) ? '; charset=utf-8' : ''), 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
});
server.listen(port, '127.0.0.1', () => console.log('Lighthigh: http://localhost:' + server.address().port));
