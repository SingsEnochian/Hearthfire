import { buildProjectZeroCapabilities } from './project-zero-capabilities.mjs';
import { buildProjectZeroDiagnostics } from './project-zero-diagnostics.mjs';

export async function handleProjectZeroRoute({ path, request, response, json }) {
  if (path === '/api/project-zero/capabilities') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return true;
    }
    json(response, 200, buildProjectZeroCapabilities(), request.method);
    return true;
  }

  if (path === '/api/project-zero/diagnostics') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return true;
    }
    try {
      json(response, 200, await buildProjectZeroDiagnostics(), request.method);
    } catch (error) {
      json(response, 503, {
        ok: false,
        error: 'project-zero-diagnostics-unavailable',
        message: error instanceof Error ? error.message : String(error),
      }, request.method);
    }
    return true;
  }

  return false;
}
