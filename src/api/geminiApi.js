export async function sendGeminiRequest(
  apiConfig,
  standardMessages,
  mimeType
) {
  const connectionMethod = apiConfig.cloudApiMethod || 'direct';

  if (!apiConfig.cloudModelName) throw new Error('Cloud Gemini model name not set.');

  let endpoint;
  let headers = { 'Content-Type': 'application/json' };
  const modelToUse = apiConfig.cloudModelName;
  
  if (connectionMethod === 'proxy') {
    if (!apiConfig.cloudProxyUrl) throw new Error('API Gateway Endpoint not configured for Vertex AI (GCP) method.');
    if (!apiConfig.gcpApiKey) throw new Error('GCP API Key not configured for Vertex AI (GCP) method.');
    endpoint = apiConfig.cloudProxyUrl;
    headers['x-api-key'] = apiConfig.gcpApiKey;
    headers['X-Model-Name'] = modelToUse;
  } else {
    if (!apiConfig.cloudApiKey) throw new Error('Cloud Gemini API Key not configured.');
    const apiKey = apiConfig.cloudApiKey;
    const cloudBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';
    const fullApiUrl = `${cloudBaseUrl}${modelToUse}:generateContent`;
    endpoint = `${fullApiUrl}?key=${apiKey}`;
  }

  let body;
  let systemInstruction = null;
  const geminiContents = [];
  const messagesToProcess = [...standardMessages];

  if (messagesToProcess.length > 0 && messagesToProcess[0].role === 'system') {
    const systemMsg = messagesToProcess.shift();
    if (systemMsg.content) {
      systemInstruction = { parts: [{ text: systemMsg.content }] };
    }
  }

  for (const message of messagesToProcess) {
    const role = message.role === 'assistant' ? 'model' : 'user';
    const parts = [];

    if (message.content) {
      parts.push({ text: message.content });
    }

    if (message.images && message.images.length > 0 && role === 'user') {
      for (const imgData of message.images) {
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: imgData
          }
        });
      }
    }

    if (parts.length > 0) {
      geminiContents.push({ role, parts });
    }
  }

  if (geminiContents.length > 0 && geminiContents[0].role === 'model') {
    geminiContents.shift();
  }

  if (geminiContents.length === 0) {
    throw new Error(`Cannot send empty request to Gemini via ${connectionMethod} method.`);
  }

  const geminiPayload = {
    contents: geminiContents,
    tools: [
      { urlContext: {} },
      {
        "googleSearch": {}
      }
    ],
    ...(systemInstruction && { systemInstruction: systemInstruction })
  };

  const modelsWithThinkingConfig = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
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
          responseText = textParts.map(p => p.text).join('');
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