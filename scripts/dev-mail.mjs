// Development-only capture. This module is never bundled into the Worker.
const messages = [];
export async function devMail(request, response) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!['localhost:8787', '127.0.0.1:8787'].includes(host) ||
      (origin && !['http://localhost:8787', 'http://127.0.0.1:8787'].includes(origin)) ||
      request.headers['sec-fetch-site'] === 'cross-site') {
    response.writeHead(403).end();
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method === 'GET') {
    response.end(JSON.stringify(messages));
    return;
  }
  if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') {
    response.writeHead(405).end();
    return;
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 16384) { response.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const id = crypto.randomUUID();
    messages.push({ ...message, id, createdAt: new Date().toISOString() });
    if (messages.length > 50) messages.shift();
    response.end(JSON.stringify({ id }));
  } catch { response.writeHead(400).end('{}'); }
}
