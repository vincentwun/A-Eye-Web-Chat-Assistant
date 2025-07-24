export async function sendOllamaRequest(
  apiConfig,
  messagesHistory,
  currentPayload,
  rawBase64,
  mimeType,
  systemPrompt,
  maxHistory
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

  const relevantHistory = messagesHistory.slice(-maxHistory);
  const ollamaMessages = [];

  if (systemPrompt) {
    ollamaMessages.push({ role: 'system', content: systemPrompt });
  }

  for (const message of relevantHistory) {
    if ((message.role === 'user' || message.role === 'assistant') && message.content) {
      const lastRole = ollamaMessages.length > 0 ? ollamaMessages[ollamaMessages.length - 1].role : null;
      if (lastRole === message.role) {
        ollamaMessages[ollamaMessages.length - 1].content += "\n" + message.content;
      } else {
        ollamaMessages.push({ role: message.role, content: message.content });
      }
    }
  }

  const currentUserMessage = {
    role: 'user',
    content: currentPayload.prompt || ""
  };
  if (rawBase64) {
    currentUserMessage.images = [rawBase64];
  }

  if (currentUserMessage.content || (currentUserMessage.images && currentUserMessage.images.length > 0)) {
    const lastRole = ollamaMessages.length > 0 ? ollamaMessages[ollamaMessages.length - 1].role : null;
    if (lastRole === 'user') {
      ollamaMessages[ollamaMessages.length - 1].content += "\n" + currentUserMessage.content;
      if (currentUserMessage.images && !ollamaMessages[ollamaMessages.length - 1].images) {
        ollamaMessages[ollamaMessages.length - 1].images = currentUserMessage.images;
      }
    } else {
      ollamaMessages.push(currentUserMessage);
    }
  } else {
    if (ollamaMessages.length === 0) {
      throw new Error("Cannot send an empty request to Ollama chat.");
    }
  }

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