import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 5173);
const CPI_URL = 'https://tablebuilder.singstat.gov.sg/api/table/tabledata/M213752';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function safeFilePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(ROOT, relative);
  if (candidate !== ROOT && !candidate.startsWith(`${ROOT}${path.sep}`)) return null;
  return candidate;
}

function proxyCpi(response) {
  const upstream = httpsRequest(CPI_URL, { headers: { Accept: 'application/json' } }, (upstreamResponse) => {
    const chunks = [];
    upstreamResponse.on('data', (chunk) => chunks.push(chunk));
    upstreamResponse.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const statusCode = upstreamResponse.statusCode === 200 ? 200 : 502;
      response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(statusCode === 200 ? body : JSON.stringify({ error: 'CPI source unavailable' }));
    });
  });
  upstream.setTimeout(5000, () => upstream.destroy(new Error('CPI request timed out')));
  upstream.on('error', () => {
    if (!response.headersSent) sendJson(response, 502, { error: 'CPI source unavailable' });
  });
}

export const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || `${HOST}:${PORT}`}`);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }
  if (requestUrl.pathname === '/api/cpi') {
    if (request.method === 'HEAD') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end();
    } else {
      proxyCpi(response);
    }
    return;
  }

  const filePath = safeFilePath(requestUrl.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }
  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  if (request.method === 'HEAD') response.end();
  else response.end(readFileSync(filePath));
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, HOST, () => {
    console.log(`FinFolio running at http://${HOST}:${PORT}`);
  });
}
