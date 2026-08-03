// Same allow-listed provider set as api/openai.js and server.js — the
// client selects one via x-provider, so local dev stays consistent with
// both deployment targets.
const OPENAI_COMPAT_PROVIDERS = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
};

module.exports = {
  '/ollama': {
    target: 'http://localhost:11434',
    secure: false,
    changeOrigin: true,
    pathRewrite: { '^/ollama': '' },
    logLevel: 'warn',
  },
  '/anthropic': {
    target: 'https://api.anthropic.com',
    secure: true,
    changeOrigin: true,
    pathRewrite: { '^/anthropic': '' },
  },
  '/openai': {
    target: OPENAI_COMPAT_PROVIDERS.groq,
    secure: true,
    changeOrigin: true,
    pathRewrite: { '^/openai': '' },
    router: req => OPENAI_COMPAT_PROVIDERS[req.headers['x-provider']] || OPENAI_COMPAT_PROVIDERS.groq,
  },
  '/hermes': {
    target: 'http://localhost:3001',
    secure: false,
    changeOrigin: true,
  },
};
