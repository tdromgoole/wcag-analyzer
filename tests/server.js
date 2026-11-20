const fs = require('node:fs');
const path = require('node:path');
const laboratoryRoot = path.resolve(__dirname, '../laboratory');
require('node:http').createServer((req,res)=>{
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Invalid path'); return; }
  if (pathname === '/laboratory') { res.writeHead(302, { Location: '/laboratory/' }); res.end(); return; }
  if (pathname.startsWith('/laboratory/')) {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const file = path.resolve(laboratoryRoot, pathname.slice('/laboratory/'.length) || 'index.html');
    if (!file.startsWith(laboratoryRoot + path.sep)) { res.writeHead(404); res.end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); res.end('Fixture not found'); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.vtt': 'text/vtt' };
      res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
    return;
  }
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html lang="en"><head><title>Accessibility test</title></head><body><main style="margin-left:420px"><h1>Test page</h1><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" width="100" height="100"><button></button><p>Test content</p></main></body></html>');
}).listen(4178,'127.0.0.1', () => console.log('Local laboratory: http://127.0.0.1:4178/laboratory/'));

