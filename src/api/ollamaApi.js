export async function sendOllamaRequest(
  apiConfig,
  standardMessages
) {
  if (!apiConfig.localApiUrl) throw new Error('Local Ollama URL is not configured.');
  if (!apiConfig.ollamaMultimodalModel) throw new Error('Ollama model name is not set.');

  let endpoint;
  try {
    endpoint = new URL('/api/chat', apiConfig.localApiUrl).toString();
  } catch (e) {
    throw new Error(`Invalid Local Ollama URL provided: ${apiConfig.localApiUrl}`);
  }

  const headers = { 'Content-Type': 'application/json' };
  let body;

  const ollamaMessages = standardMessages.map(msg => {
    const message = {
      role: msg.role,
      content: msg.content || ""
    };
    if (msg.images && msg.images.length > 0) {
      message.images = msg.images;
    }
    return message;
  });

  const ollamaPayload = {
    model: apiConfig.ollamaMultimodalModel,
    messages: ollamaMessages,
    stream: false
  };
  body = JSON.stringify(ollamaPayload);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: body
    });

    if (!response.ok) {
      let errorBodyText = '';
      try { errorBodyText = await response.text(); } catch (e) { /* ignore */ }
      let detailedError = `API Error (${response.status} ${response.statusText})`;
      if (errorBodyText) {
        try {
          const errorJson = JSON.parse(errorBodyText);
          detailedError += `: ${errorJson.error || errorBodyText.substring(0, 200)}`;
        } catch (e) {
          detailedError += `. Response: ${errorBodyText.substring(0, 200)}`;
        }
      }
      throw new Error(detailedError);
    }

    const data = await response.json();
    let responseText = 'Error: Could not parse Ollama response.';
    if (data.message && typeof data.message.content === 'string') {
      responseText = data.message.content;
    } else if (data.error) {
      responseText = `Ollama API Error: ${data.error}`;
    } else if (typeof data.response === 'string') {
      responseText = data.response;
    }
    return responseText;

  } catch (error) {
    throw error;
  }
}