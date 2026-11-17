require('node:http').createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html lang="en"><head><title>Accessibility test</title></head><body><main style="margin-left:420px"><h1>Test page</h1><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" width="100" height="100"><button></button><p>Test content</p></main></body></html>');
}).listen(4178,'127.0.0.1');

