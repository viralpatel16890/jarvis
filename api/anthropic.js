import { corsPreflightResponse, withCors } from './_shared/cors.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(
      'content-type, x-api-key, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access'
    );
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/anthropic/, '') + url.search;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`https://api.anthropic.com${path}`, {
      method: req.method,
      headers: {
        'content-type': 'application/json',
        'x-api-key': req.headers.get('x-api-key') || process.env.ANTHROPIC_KEY || '',
        'anthropic-version': req.headers.get('anthropic-version') || '2023-06-01',
        'anthropic-dangerous-direct-browser-access':
          req.headers.get('anthropic-dangerous-direct-browser-access') || 'true',
        ...(req.headers.get('anthropic-beta')
          ? { 'anthropic-beta': req.headers.get('anthropic-beta') }
          : {}),
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    return withCors(
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/json',
          'cache-control': 'no-store',
        },
      })
    );
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Upstream request timed out' }), {
        status: 504,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        },
      });
    }
    throw error;
  }
}
