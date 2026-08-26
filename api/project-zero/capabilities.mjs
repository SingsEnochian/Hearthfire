import { buildProjectZeroCapabilities } from '../../starwell-server/project-zero-capabilities.mjs';

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ ok: false, error: 'method-not-allowed' }));
    return;
  }

  const body = JSON.stringify(buildProjectZeroCapabilities());
  response.statusCode = 200;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.end(request.method === 'HEAD' ? '' : body);
}
