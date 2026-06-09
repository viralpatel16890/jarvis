export async function getWeatherTool(location = 'auto'): Promise<string> {
  try {
    const target = location === 'auto' ? '' : encodeURIComponent(location);
    const url = `https://wttr.in/${target}?format=j1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather unavailable');

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
    return `Unable to fetch weather data. ${(e as Error).message}`;
  }
}
