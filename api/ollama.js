import { corsPreflightResponse, withCors } from './_shared/cors.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse('content-type');
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${base}${path}`, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
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
