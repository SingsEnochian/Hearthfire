const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function isAllowedLoopbackOrigin(origin) {
  if (typeof origin !== 'string' || origin.trim() === '') return false;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function applyLoopbackCors(request, response) {
  const origin = request?.headers?.origin;
  if (!isAllowedLoopbackOrigin(origin)) return false;

  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('access-control-allow-methods', 'GET, HEAD, POST, OPTIONS');
  response.setHeader('access-control-allow-headers', 'Accept, Content-Type');
  response.setHeader('access-control-max-age', '600');
  response.setHeader('vary', 'Origin');
  return true;
}
