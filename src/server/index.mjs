import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionStore } from './session-store.mjs';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const MAX_REQUEST_BYTES = 256 * 1024;
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const store = createSessionStore();

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_REQUEST_BYTES) {
      throw new Error('Request body is too large.');
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid JSON request body.');
  }
}

function startEventStream(response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
}

async function serveStaticAsset(requestPath, response) {
  const requestedPath = requestPath === '/' ? '/index.html' : requestPath;
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  if (!normalizedPath.startsWith('/')) {
    sendJson(response, 404, { error: 'Asset not found.' });
    return;
  }

  const assetPath = join(publicRoot, normalizedPath);

  try {
    const content = await readFile(assetPath);
    response.writeHead(200, {
      'Content-Type': contentTypes.get(extname(assetPath)) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: 'Asset not found.' });
  }
}

function withErrorHandling(handler) {
  return async (request, response, url) => {
    try {
      await handler(request, response, url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      const statusCode = message.includes('not found') || message.includes('Participant') ? 404 : 400;
      sendJson(response, statusCode, { error: message });
    }
  };
}

const routes = [
  {
    method: 'POST',
    pattern: /^\/api\/sessions$/,
    handler: withErrorHandling(async (request, response) => {
      const body = await readJsonBody(request);
      const session = store.createSession({ hostName: body.hostName });
      sendJson(response, 201, session);
    }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/([^/]+)$/,
    handler: withErrorHandling(async (_request, response, url) => {
      const sessionId = url.pathname.split('/').at(-1);
      sendJson(response, 200, store.getSessionSummary(sessionId));
    }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/sessions\/([^/]+)\/participants$/,
    handler: withErrorHandling(async (request, response, url) => {
      const sessionId = url.pathname.split('/')[3];
      const body = await readJsonBody(request);
      const participant = store.addViewer(sessionId, { viewerName: body.viewerName });
      sendJson(response, 201, participant);
    }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/([^/]+)\/events$/,
    handler: withErrorHandling(async (_request, response, url) => {
      const sessionId = url.pathname.split('/')[3];
      const participantId = url.searchParams.get('participantId');
      if (!participantId) {
        throw new Error('participantId is required.');
      }

      startEventStream(response);
      const detach = store.attachEventStream(sessionId, participantId, response);
      response.on('close', detach);
    }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/sessions\/([^/]+)\/messages$/,
    handler: withErrorHandling(async (request, response, url) => {
      const sessionId = url.pathname.split('/')[3];
      const body = await readJsonBody(request);
      const routedMessage = store.routeMessage(sessionId, {
        from: body.from,
        to: body.to,
        type: body.type,
        payload: body.payload,
      });
      sendJson(response, 202, routedMessage);
    }),
  },
];

const server = createServer(async (request, response) => {
  if (!request.url || !request.method) {
    sendJson(response, 400, { error: 'Invalid request.' });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  const matchingRoute = routes.find((route) => route.method === request.method && route.pattern.test(url.pathname));

  if (matchingRoute) {
    await matchingRoute.handler(request, response, url);
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/host') || url.pathname.startsWith('/client') || url.pathname.startsWith('/assets/'))) {
    await serveStaticAsset(url.pathname === '/host' ? '/host.html' : url.pathname === '/client' ? '/client.html' : url.pathname, response);
    return;
  }

  sendJson(response, 404, { error: 'Route not found.' });
});

server.listen(PORT, () => {
  console.log(`VideoStreamer listening on http://localhost:${PORT}`);
});
