export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
    });
  }

  const ollamaUrl = process.env.OLLAMA_URL;
  if (!ollamaUrl) {
    return new Response(
      JSON.stringify({ error: 'OLLAMA_URL is not configured. Set it in Vercel → Settings → Environment Variables.' }),
      {
        status: 503,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      }
    );
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ollama/, '') + url.search;
  const base = ollamaUrl.replace(/\/$/, '');

  const response = await fetch(`${base}${path}`, {
    method: req.method,
    headers: { 'content-type': 'application/json' },
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
