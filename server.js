const http = require('http');
const fs = require('fs');
const path = require('path');
const { DEFAULT_CONFIG } = require('./pricing');
const { createApiController } = require('./controller');
const root = __dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const runtimeConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
const handleApiRequest = createApiController(runtimeConfig);

http.createServer(async (request, response) => {
  if (await handleApiRequest(request, response)) return;
  const requested = request.url === '/' ? '/index.html' : request.url;
  const filePath = path.resolve(root, '.' + requested.split('?')[0]);
  if (!filePath.startsWith(root + path.sep)) { response.writeHead(403); response.end('Forbidden'); return; }
  fs.readFile(filePath, (error, content) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'text/plain' }); response.end(content);
  });
}).listen(4173, '0.0.0.0', () => console.log('Friday night counter running at http://localhost:4173'));