import { buildProjectZeroDiagnostics } from '../../starwell-server/project-zero-diagnostics.mjs';

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ ok: false, error: 'method-not-allowed' }));
    return;
  }

  try {
    const diagnostics = await buildProjectZeroDiagnostics({
      diagnosticsCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.HEARTHFIRE_DIAGNOSTICS_COMMIT || null,
    });
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.end(request.method === 'HEAD' ? '' : JSON.stringify(diagnostics));
  } catch {
    response.statusCode = 503;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(request.method === 'HEAD' ? '' : JSON.stringify({ ok: false, error: 'project-zero-diagnostics-unavailable' }));
  }
}
