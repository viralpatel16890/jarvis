import { ToolMetadata } from '../models/tool.model';

const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const SearchTool: ToolMetadata = {
  definition: {
    name: 'search',
    description: 'Search the web for information using DuckDuckGo.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query string.',
        },
      },
      required: ['query'],
    },
  },
  execute: async ({ query }: { query: string }) => {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error('Search API returned ' + res.status);

      const data = await res.json();
      const abstract = data.AbstractText;
      const answer = data.Answer;
      const definition = data.Definition;
      const relatedTopics: string[] = (data.RelatedTopics ?? [])
        .filter((t: { Text?: string }) => t.Text)
        .slice(0, 3)
        .map((t: { Text: string }) => t.Text);

      const parts: string[] = [];
      if (answer) parts.push(`Answer: ${answer}`);
      if (abstract) parts.push(abstract);
      if (definition) parts.push(`Definition: ${definition}`);
      if (relatedTopics.length) parts.push(`Related: ${relatedTopics.join(' | ')}`);

      if (parts.length === 0) {
        window.open(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, '_blank');
        return `No instant answer found. Opened DuckDuckGo search for "${query}" in a new tab.`;
      }

      return parts.join('\n');
    } catch (e) {
      const reason = (e as Error).name === 'AbortError' ? 'request timed out' : (e as Error).message;
      window.open(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, '_blank');
      return `Search failed (${reason}). Opened DuckDuckGo for "${query}" in a new tab.`;
    }
  },
};

export const OpenUrlTool: ToolMetadata = {
  definition: {
    name: 'open_url',
    description: 'Open a specific URL in a new browser tab.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to open (e.g., "google.com" or "https://github.com").',
        },
      },
      required: ['url'],
    },
  },
  execute: ({ url }: { url: string }) => {
    const target = url.startsWith('http') ? url : `https://${url}`;
    window.open(target, '_blank');
    return `Opened ${target} in a new tab.`;
  },
};
