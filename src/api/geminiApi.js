export async function sendGeminiRequest(
  apiConfig,
  messagesHistory,
  currentPayload,
  rawBase64,
  mimeType,
  systemPrompt,
  maxHistory
) {
  const connectionMethod = apiConfig.cloudApiMethod || 'direct';

  if (!apiConfig.cloudApiKey) throw new Error('Cloud Gemini API Key not configured.');
  if (!apiConfig.cloudModelName) throw new Error('Cloud Gemini model name not set.');

  let endpoint;
  let headers = { 'Content-Type': 'application/json' };
  const modelToUse = apiConfig.cloudModelName;
  const apiKey = apiConfig.cloudApiKey;

  if (connectionMethod === 'proxy') {
    if (!apiConfig.cloudProxyUrl) throw new Error('API Gateway / Cloud Function Proxy URL not configured for proxy method.');
    endpoint = apiConfig.cloudProxyUrl;
    headers['x-api-key'] = apiKey;
    headers['X-Model-Name'] = modelToUse;
  } else {
    if (!apiConfig.cloudApiUrl) throw new Error('Cloud API Base URL not configured for direct method.');
    const cloudBaseUrl = apiConfig.cloudApiUrl.endsWith('/') ? apiConfig.cloudApiUrl : apiConfig.cloudApiUrl + '/';
    const fullApiUrl = `${cloudBaseUrl}${modelToUse}:generateContent`;
    endpoint = `${fullApiUrl}?key=${apiKey}`;
  }

  let body;

  const relevantHistory = messagesHistory.slice(-maxHistory);
  const geminiContents = [];

  for (const message of relevantHistory) {
    let role = null;
    let parts = [];
    if (message.role === 'user' && message.content) {
      role = 'user';
      parts.push({ text: message.content });
    } else if (message.role === 'assistant' && message.content) {
      role = 'model';
      parts.push({ text: message.content });
    }

    if (role && parts.length > 0) {
      if (geminiContents.length === 0 && role !== 'user') {
        continue;
      }
      const lastRole = geminiContents.length > 0 ? geminiContents[geminiContents.length - 1].role : null;
      if (lastRole === role) {
        const lastParts = geminiContents[geminiContents.length - 1].parts;
        const currentText = parts.find(p => p.text)?.text;
        if (currentText) {
          const lastTextPartIndex = lastParts.findLastIndex(p => p.text);
          if (lastTextPartIndex !== -1) { lastParts[lastTextPartIndex].text += "\n" + currentText; }
          else { lastParts.push({ text: currentText }); }
        }
      } else {
        geminiContents.push({ role, parts });
      }
    }
  }

  const currentUserParts = [];
  if (currentPayload.prompt) {
    currentUserParts.push({ text: currentPayload.prompt });
  }
  if (rawBase64) {
    currentUserParts.push({
      inline_data: {
        mime_type: mimeType,
        data: rawBase64
      }
    });
  }

  if (currentUserParts.length > 0) {
    const lastRole = geminiContents.length > 0 ? geminiContents[geminiContents.length - 1].role : null;
    if (lastRole === 'user') {
      const lastParts = geminiContents[geminiContents.length - 1].parts;
      const currentText = currentUserParts.find(p => p.text)?.text;
      const currentImage = currentUserParts.find(p => p.inline_data);
      if (currentText) {
        const lastTextPartIndex = lastParts.findLastIndex(p => p.text);
        if (lastTextPartIndex !== -1) { lastParts[lastTextPartIndex].text += "\n" + currentText; }
        else { lastParts.push({ text: currentText }); }
      }
      if (currentImage && !lastParts.some(p => p.inline_data)) {
        lastParts.push(currentImage);
      }
    } else {
      geminiContents.push({ role: 'user', parts: currentUserParts });
    }
  } else {
    if (geminiContents.length === 0 && !systemPrompt) {
      throw new Error(`Cannot send empty request to Gemini via ${connectionMethod} method.`);
    }
  }

  const geminiPayload = {
    contents: geminiContents,
    tools: [
      {
        "googleSearch": {}
      }
    ],
    ...(systemPrompt && { systemInstruction: { parts: [{ text: systemPrompt }] } })
  };

  const modelsWithThinkingConfig = ['gemini-2.5-flash'];

  if (modelsWithThinkingConfig.includes(modelToUse)) {
    geminiPayload.generationConfig = {
      thinkingConfig: {
        thinkingBudget: -1,
      }
    };
  }

  body = JSON.stringify(geminiPayload);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: body
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      const errorBodyText = await response.text();
      throw new Error(`API Error (${response.status} ${response.statusText}). Response: ${errorBodyText.substring(0, 200)}`);
    }

    if (!response.ok) {
      let detailedError = `API Error via ${connectionMethod} (${response.status} ${response.statusText})`;
      if (data && data.error) {
        if (typeof data.error === 'string') {
          detailedError += `: ${data.error}`;
        } else if (data.error.message) {
          detailedError += `: ${data.error.message}`;
        } else {
          detailedError += `. Response: ${JSON.stringify(data.error).substring(0, 200)}`;
        }
      } else if (data) {
        detailedError += `. Response: ${JSON.stringify(data).substring(0, 200)}`;
      }
      throw new Error(detailedError);
    }

    let responseText = `Error: Could not parse ${connectionMethod === 'proxy' ? 'proxied' : ''} Gemini response.`;
    try {
      if (data.candidates && data.candidates[0]?.content?.parts) {
        const textParts = data.candidates[0].content.parts.filter(part => part.text);
        if (textParts.length > 0) {
          responseText = textParts[textParts.length - 1].text;
        }
      } else if (data.promptFeedback?.blockReason) {
        responseText = `Request blocked by API: ${data.promptFeedback.blockReason}`;
        if (data.promptFeedback.safetyRatings) {
          responseText += ` - Details: ${data.promptFeedback.safetyRatings.map(r => `${r.category}: ${r.probability}`).join(', ')}`;
        }
      } else if (data.candidates && data.candidates[0]?.finishReason && data.candidates[0].finishReason !== "STOP") {
        responseText = `Request finished unexpectedly. Reason: ${data.candidates[0].finishReason}`;
        const safetyRatingsInfo = data.candidates[0].safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ');
        if (safetyRatingsInfo) responseText += ` (Safety Ratings: ${safetyRatingsInfo})`;
        if (data.candidates[0].content?.parts?.some(p => p.text)) {
          const partialText = data.candidates[0].content.parts.filter(p => p.text).map(p => p.text).join('');
          responseText += `\nPartial content: ${partialText}`;
        }
      } else if (data.error) {
        responseText = `${connectionMethod === 'proxy' ? 'Proxied ' : ''}Gemini API Error: ${data.error.message || 'Unknown error'}`;
      }
    } catch (parseError) {
      responseText = `Error: Failed to process ${connectionMethod === 'proxy' ? 'proxied ' : ''}Gemini response content.`;
    }
    return responseText;

  } catch (error) {
    if (error instanceof Error && error.message.startsWith('API Error')) {
      throw error;
    } else {
      throw new Error(`Failed to communicate with ${connectionMethod} endpoint or process response: ${error.message}`);
    }
  }
}