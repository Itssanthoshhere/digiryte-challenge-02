const http = require('http');
const httpProxy = require('http-proxy');

const LB_PORT = process.env.LB_PORT || 3000;
const TARGETS = (process.env.SERVERS || 'http://localhost:3001,http://localhost:3002')
  .split(',')
  .map((url) => url.trim());

const proxy = httpProxy.createProxyServer({
  ws: true,
  changeOrigin: true,
});

proxy.on('error', (err, req, res) => {
  console.error(`[Load Balancer] Proxy error for ${req.url}:`, err.message);
  if (res && typeof res.writeHead === 'function' && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway: Backend instance unavailable' }));
  }
});

let requestIndex = 0;
let wsIndex = 0;

function getNextTarget(isWs = false) {
  const index = isWs ? wsIndex++ : requestIndex++;
  return TARGETS[index % TARGETS.length];
}

const server = http.createServer((req, res) => {
  const target = getNextTarget(false);
  proxy.web(req, res, { target });
});

// Proxy WebSocket upgrade requests (Socket.io)
server.on('upgrade', (req, socket, head) => {
  const target = getNextTarget(true);
  console.log(`[Load Balancer] Proxying WebSocket connection -> ${target}`);
  proxy.ws(req, socket, head, { target });
});

server.listen(LB_PORT, () => {
  console.log(`[Load Balancer] Running on http://localhost:${LB_PORT}`);
  console.log(`[Load Balancer] Balancing traffic across: ${TARGETS.join(', ')}`);
});
