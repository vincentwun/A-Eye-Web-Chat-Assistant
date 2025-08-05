const DEFAULT_LMSTUDIO_URL = 'http://localhost:1234';

function formatMessagesForLmstudio(standardMessages) {
  return standardMessages.map(msg => {
    const contentParts = [];
    if (msg.content) {
      contentParts.push({ type: 'text', text: msg.content });
    }

    if (msg.images && msg.images.length > 0) {
      msg.images.forEach(base64Image => {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`
          }
        });
      });
    }

    return {
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: contentParts
    };
  }).filter(msg => msg.role !== 'system');
}


export async function sendLmstudioRequest(apiConfig, standardMessages) {
  const apiUrl = DEFAULT_LMSTUDIO_URL;
  const model = apiConfig.lmstudioModelName;

  if (!model) throw new Error('LM Studio model name is not set.');

  let endpoint;
  try {
    endpoint = new URL('/v1/chat/completions', apiUrl).toString();
  } catch (e) {
    throw new Error(`Invalid LM Studio URL provided: ${apiUrl}`);
  }

  const headers = { 'Content-Type': 'application/json' };

  const formattedMessages = formatMessagesForLmstudio(standardMessages);

  if (formattedMessages.length === 0) {
    throw new Error("Cannot send an empty request to LM Studio.");
  }

  const body = JSON.stringify({
    model: model,
    messages: formattedMessages,
    stream: false
  });

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
          detailedError += `: ${errorJson.error?.message || errorBodyText.substring(0, 200)}`;
        } catch (e) {
          detailedError += `. Response: ${errorBodyText.substring(0, 200)}`;
        }
      }
      throw new Error(detailedError);
    }

    const data = await response.json();

    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content;
    }

    return 'Error: Could not parse LM Studio response.';

  } catch (error) {
    throw error;
  }
}