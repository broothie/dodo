import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import './setup-local-auth.mjs';
import { devMail } from './dev-mail.mjs';

const npm = process.env.npm_execpath;
if (!npm) throw new Error('Start development with npm run dev.');
const children = new Set();
const sockets = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server.close();
  for (const socket of sockets) socket.destroy();
  for (const child of children) {
    if (process.platform === 'win32') child.kill();
    else try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  }
  process.exitCode = code;
}
function run(args, env = {}) {
  const child = spawn(process.execPath, [npm, ...args], {
    stdio: 'inherit', detached: process.platform !== 'win32',
    env: { ...process.env, ...env },
  });
  children.add(child);
  child.on('error', error => { console.error(error); stop(1); });
  child.on('exit', code => { children.delete(child); if (!stopping) stop(code || 1); });
  return child;
}
const retirementWorker = await readFile(new URL('./retire-service-worker.js', import.meta.url));
const server = http.createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (new URL(request.url, 'http://localhost').pathname === '/__dev/mail') {
    void devMail(request, response);
    return;
  }
  if (new URL(request.url, 'http://localhost').pathname === '/sw.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/' });
    response.end(retirementWorker);
    return;
  }
  const api = request.url.startsWith('/api/');
  const upstream = http.request({
    hostname: '127.0.0.1', port: api ? 8788 : 8081,
    path: request.url, method: request.method,
    headers: { ...request.headers, host: `localhost:${api ? 8788 : 8081}` },
  }, incoming => {
    response.writeHead(incoming.statusCode, { ...incoming.headers, 'cache-control': 'no-store' });
    incoming.pipe(response);
  });
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'text/plain', Refresh: '1' });
    response.end('Development servers are starting. Refresh in a moment.');
  });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
});
server.on('connection', socket => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});
// Forward Metro's Fast Refresh WebSocket as well as its ordinary HTTP requests.
server.on('upgrade', (request, socket, head) => {
  const upstream = http.request({ hostname: '127.0.0.1', port: 8081,
    path: request.url, headers: { ...request.headers, host: 'localhost:8081' } });
  upstream.on('upgrade', (incoming, remote, remoteHead) => {
    socket.write(`HTTP/1.1 ${incoming.statusCode} ${incoming.statusMessage}\r\n`);
    for (let i = 0; i < incoming.rawHeaders.length; i += 2)
      socket.write(`${incoming.rawHeaders[i]}: ${incoming.rawHeaders[i + 1]}\r\n`);
    socket.write('\r\n');
    if (head.length) remote.write(head);
    if (remoteHead.length) socket.write(remoteHead);
    socket.pipe(remote).pipe(socket);
    socket.on('error', () => remote.destroy());
    remote.on('error', () => socket.destroy());
    socket.on('close', () => remote.destroy());
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});
server.on('error', error => { console.error(error.message); stop(1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

const migration = spawn(process.execPath, [npm, 'run', 'db:migrate'], { stdio: 'inherit' });
const migrated = await new Promise(resolve => {
  migration.on('exit', code => resolve(code === 0));
  migration.on('error', () => resolve(false));
});
if (!migrated) process.exit(1);
server.listen(8787, '127.0.0.1', () => {
  console.log('Dodo development: http://localhost:8787 (Fast Refresh, no browser caching)');
  run(['exec', '-w', '@dodo/api', '--', 'wrangler', 'dev', '--port', '8788', '--assets', '../app/public']);
  run(['exec', '-w', '@dodo/app', '--', 'expo', 'start', '--port', '8081', '--localhost', ...process.argv.slice(2)], {
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? '',
  });
});
