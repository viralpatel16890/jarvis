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

export const WeatherTool: ToolMetadata = {
  definition: {
    name: 'weather',
    description: 'Get the current weather for a specific location.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and country, e.g., "Mumbai, India". Defaults to "auto" if not provided.',
        },
      },
      required: [],
    },
  },
  execute: async ({ location = 'auto' }: { location?: string }) => {
    try {
      const target = location === 'auto' ? '' : encodeURIComponent(location);
      const url = `https://wttr.in/${target}?format=j1`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error('Weather API returned ' + res.status);

      const data = await res.json();
      const current = data.current_condition?.[0];
      const area = data.nearest_area?.[0];
      const city = area?.areaName?.[0]?.value ?? location;
      const country = area?.country?.[0]?.value ?? '';
      const desc = current?.weatherDesc?.[0]?.value ?? 'Unknown';
      const tempC = current?.temp_C ?? '?';
      const tempF = current?.temp_F ?? '?';
      const humidity = current?.humidity ?? '?';
      const windKmph = current?.windspeedKmph ?? '?';
      const feels = current?.FeelsLikeC ?? '?';

      return `Weather in ${city}${country ? ', ' + country : ''}: ${desc}. ` +
        `Temperature: ${tempC}°C (${tempF}°F), feels like ${feels}°C. ` +
        `Humidity: ${humidity}%. Wind: ${windKmph} km/h.`;
    } catch (e) {
      const reason = (e as Error).name === 'AbortError' ? 'request timed out' : (e as Error).message;
      return `Unable to fetch weather data: ${reason}`;
    }
  },
};
