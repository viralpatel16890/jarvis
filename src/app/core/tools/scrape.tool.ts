import { ToolMetadata } from '../models/tool.model';

const FETCH_TIMEOUT_MS = 15_000;

export const ScrapeTool: ToolMetadata = {
  definition: {
    name: 'scrape',
    description: 'Fetch the text content of a webpage for deep research and fact-checking.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to scrape (e.g., "https://en.wikipedia.org/wiki/Artificial_intelligence").',
        },
      },
      required: ['url'],
    },
  },
  execute: async ({ url }: { url: string }) => {
    try {
      const response = await fetch('/hermes/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.text || 'No content found on the page.';
    } catch (e) {
      return `Failed to scrape "${url}": ${(e as Error).message}`;
    }
  },
};
