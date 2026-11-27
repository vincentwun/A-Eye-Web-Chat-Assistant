async function openAIHttpError(response: Response): Promise<Error> {
  let text = '';
  try { text = await response.text(); } catch { /* Preserve the HTTP status when the body cannot be read. */ }
  let detail = `API Error (${response.status} ${response.statusText})`;
  if (text) {
    try {
      const json = JSON.parse(text);
      detail += `: ${json.error?.message || text.substring(0, 200)}`;
    } catch {
      detail += `. Response: ${text.substring(0, 200)}`;
    }
  }
  return new Error(detail);
}

export async function postOpenAICompletion(endpoint: string, body: object) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await openAIHttpError(response);
  return response.json();
}
