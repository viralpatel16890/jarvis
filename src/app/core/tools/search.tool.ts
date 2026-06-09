export async function searchTool(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Search unavailable');

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
    window.open(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, '_blank');
    return `Search error. Opened DuckDuckGo search for "${query}" in a new tab.`;
  }
}

export function openUrlTool(url: string): string {
  const target = url.startsWith('http') ? url : `https://${url}`;
  window.open(target, '_blank');
  return `Opened ${target} in a new tab.`;
}
