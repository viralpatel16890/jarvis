import { corsPreflightResponse, withCors } from './_shared/cors.js';

export const config = { runtime: 'edge' };

// Allow-listed OpenAI-compatible providers only. The client selects one via
// the x-provider header — never a client-supplied URL — so this can't be
// turned into an open proxy to an arbitrary host (SSRF).
const PROVIDERS = {
  groq:       'https://api.groq.com/openai/v1',
  gemini:     'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
  openai:     'https://api.openai.com/v1',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse('content-type, authorization, x-provider');
  }

  const base = PROVIDERS[req.headers.get('x-provider')];
  if (!base) {
    return new Response(
      JSON.stringify({ error: `Unknown or missing provider. Use one of: ${Object.keys(PROVIDERS).join(', ')}` }),
      { status: 400, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }
    );
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/openai/, '') + url.search;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${base}${path}`, {
      method: req.method,
      headers: {
        'content-type': 'application/json',
        authorization: req.headers.get('authorization') || '',
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
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      });
    }
    throw error;
  }
}
