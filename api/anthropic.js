export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers':
          'content-type, x-api-key, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access',
      },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/anthropic/, '') + url.search;

  const response = await fetch(`https://api.anthropic.com${path}`, {
    method: req.method,
    headers: {
      'content-type': 'application/json',
      'x-api-key': req.headers.get('x-api-key') ?? process.env.ANTHROPIC_KEY ?? '',
      'anthropic-version': req.headers.get('anthropic-version') ?? '2023-06-01',
      'anthropic-dangerous-direct-browser-access':
        req.headers.get('anthropic-dangerous-direct-browser-access') ?? 'true',
      ...(req.headers.get('anthropic-beta')
        ? { 'anthropic-beta': req.headers.get('anthropic-beta') }
        : {}),
    },
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    },
  });
}
