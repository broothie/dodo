// A built app + real Worker/D1, with no production bindings or credentials.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

const directory = await mkdtemp(join(tmpdir(), 'dodo-e2e-'));
const configPath = join(directory, 'wrangler.json');
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const production = JSON.parse(await readFile('apps/api/wrangler.jsonc', 'utf8'));
await writeFile(configPath, JSON.stringify({
  name: 'dodo-e2e',
  main: resolve('apps/api/src/index.ts'),
  compatibility_date: production.compatibility_date,
  compatibility_flags: production.compatibility_flags,
  assets: { ...production.assets, directory: resolve('apps/app/dist') },
  vars: {
    BETTER_AUTH_URL: 'http://localhost:8790',
    BETTER_AUTH_ADDITIONAL_ORIGINS: '',
    AUTH_EMAIL_FROM: 'Dodo Test <login@example.test>',
    AUTH_EMAIL_DEV_URL: 'http://localhost:8790/__dev/mail',
  },
  d1_databases: [{
    binding: 'DB', database_name: 'dodo-e2e', database_id: randomUUID(),
    migrations_dir: resolve('apps/api/migrations'), remote: false,
  }],
}));
await writeFile(join(directory, '.dev.vars'),
  `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\nRESEND_API_KEY=unused-test-placeholder\n`,
  { mode: 0o600 });
const args = ['--config', configPath, '--persist-to', join(directory, 'state')];
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(directory, 'wrangler.log') };
const migration = spawn(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'dodo-e2e', '--local', ...args], { env, stdio: 'inherit' });
const code = await new Promise((resolve, reject) => {
  migration.on('exit', resolve);
  migration.on('error', reject);
});
if (code !== 0) { await rm(directory, { recursive: true, force: true }); process.exit(1); }

const messages = [];
const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/__dev/mail') {
    // Only this isolated loopback test server exposes its captured mail.
    if (request.headers.host !== 'localhost:8790' ||
      (request.headers.origin && request.headers.origin !== 'http://localhost:8790') ||
      request.headers['sec-fetch-site'] === 'cross-site') {
      response.writeHead(403).end(); return;
    }
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET') { response.end(JSON.stringify(messages)); return; }
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 16384) { response.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const message = JSON.parse(Buffer.concat(chunks).toString());
      messages.push(message);
      response.end(JSON.stringify({ id: randomUUID() }));
    } catch { response.writeHead(400).end('{}'); }
    return;
  }
  const upstream = http.request({
    hostname: '127.0.0.1', port: 8792, path: request.url, method: request.method,
    headers: { ...request.headers, host: 'localhost:8792' },
  }, incoming => { response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response); });
  upstream.on('error', () => { response.writeHead(503).end('Test Worker starting'); });
  request.pipe(upstream);
});
server.listen(8790, '127.0.0.1');
const worker = spawn(process.execPath, [wrangler, 'dev', '--local', '--port', '8792', '--inspector-port', '0', ...args], { env, stdio: 'inherit' });
let stopping = false;
async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  server.close();
  if (worker.exitCode === null) {
    worker.kill('SIGTERM');
    await new Promise(resolve => worker.on('exit', resolve));
  }
  await rm(directory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
worker.on('error', () => void stop(1));
worker.on('exit', code => { if (!stopping) void stop(code || 1); });
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
