function stripBase64Prefix(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    console.warn("Invalid or non-image data URL provided:", dataUrl);
    return null;
  }
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    console.warn("Could not find comma separator in data URL:", dataUrl);
    return null;
  }
  return dataUrl.substring(commaIndex + 1);
}

export class ApiService {

  async _sendOllamaRequest(apiConfig, messagesHistory, currentPayload, rawBase64, mimeType, systemPrompt) {
    console.log("Executing Ollama request logic...");
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

    const MAX_HISTORY_MESSAGES = 10;
    const relevantHistory = messagesHistory.slice(-MAX_HISTORY_MESSAGES);
    const ollamaMessages = [];

    if (systemPrompt) {
      ollamaMessages.push({ role: 'system', content: systemPrompt });
      console.log("Prepending Ollama system prompt.");
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
        } else if (currentUserMessage.images) {
          console.warn("Cannot merge images into existing user message images for Ollama.");
        }
      } else {
        ollamaMessages.push(currentUserMessage);
      }
    } else {
      if (ollamaMessages.length === 0) {
        throw new Error("Cannot send an empty request to Ollama chat.");
      }
      console.warn("Sending Ollama request with history/system prompt only (no current user prompt/image).");
    }

    const ollamaPayload = {
      model: apiConfig.ollamaMultimodalModel,
      messages: ollamaMessages,
      stream: false
    };
    body = JSON.stringify(ollamaPayload);
    console.log(`Sending to Local Ollama (/api/chat): ${endpoint} (Model: ${ollamaPayload.model}) with ${ollamaMessages.length} message turns.`);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: body
      });

      if (!response.ok) {
        let errorBodyText = '';
        try { errorBodyText = await response.text(); } catch (e) { console.warn("Could not read error response body:", e); }
        console.error(`API Error Response (Ollama - ${response.status} ${response.statusText}):`, errorBodyText);
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
      console.log("Ollama API Response Data:", data);

      let responseText = 'Error: Could not parse Ollama response.';
      if (data.message && typeof data.message.content === 'string') {
        responseText = data.message.content;
      } else if (data.error) {
        responseText = `Ollama API Error: ${data.error}`;
        console.error("Ollama API returned error object:", data);
      } else if (typeof data.response === 'string') {
        responseText = data.response;
        console.warn("Received response in 'data.response' field, expected 'data.message.content' for /api/chat.");
      } else {
        console.warn("Unexpected Ollama /api/chat response structure:", data);
      }
      return responseText;

    } catch (error) {
      console.error("Error during Ollama fetch or response processing:", error);
      throw error;
    }
  }

  async _sendGeminiRequest(apiConfig, messagesHistory, currentPayload, rawBase64, mimeType, systemPrompt) {
    const connectionMethod = apiConfig.cloudApiMethod || 'direct';
    console.log(`Executing Gemini request logic via ${connectionMethod} method...`);

    if (!apiConfig.cloudApiKey) throw new Error('Cloud Gemini API Key not configured.');
    if (!apiConfig.cloudModelName) throw new Error('Cloud Gemini model name not set.');

    let endpoint;
    let headers = { 'Content-Type': 'application/json' };
    const modelToUse = apiConfig.cloudModelName;
    const apiKey = apiConfig.cloudApiKey;

    if (connectionMethod === 'proxy') {
      if (!apiConfig.cloudProxyUrl) throw new Error('Cloud Function Proxy URL not configured for proxy method.');
      endpoint = apiConfig.cloudProxyUrl;
      headers['X-Api-Key'] = apiKey;
      headers['X-Model-Name'] = modelToUse;
      console.log(`Using Proxy Endpoint: ${endpoint}`);
    } else {
      if (!apiConfig.cloudApiUrl) throw new Error('Cloud API Base URL not configured for direct method.');
      const cloudBaseUrl = apiConfig.cloudApiUrl.endsWith('/') ? apiConfig.cloudApiUrl : apiConfig.cloudApiUrl + '/';
      const fullApiUrl = `${cloudBaseUrl}${modelToUse}:generateContent`;
      endpoint = `${fullApiUrl}?key=${apiKey}`;
      console.log(`Using Direct Endpoint: ${fullApiUrl}`);
    }

    let body;

    const MAX_HISTORY_MESSAGES = 10;
    const relevantHistory = messagesHistory.slice(-MAX_HISTORY_MESSAGES);
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
          console.warn("Skipping initial non-user message in Gemini history build.");
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
          console.warn(`Merging consecutive ${role} messages for Gemini.`);
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
      if (geminiContents.length > 0 && geminiContents[geminiContents.length - 1].role === 'user') {
        console.warn(`Attempting to send Gemini request ending in 'user' role without new content via ${connectionMethod}. API might reject this.`);
      }
      console.warn(`Sending Cloud request via ${connectionMethod} with history/system prompt only (no current prompt/image).`);
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

    if (modelToUse === "gemini-2.5-flash-preview-04-17") {
      geminiPayload.generationConfig = {
        thinkingConfig: {
          thinkingBudget: 800,
        }
      };
      console.log(`Adding thinkingConfig with budget ${geminiPayload.generationConfig.thinkingConfig.thinkingBudget} for model ${modelToUse}`);
    }

    body = JSON.stringify(geminiPayload);
    console.log(`Sending to ${connectionMethod === 'proxy' ? 'Proxy' : 'Cloud Gemini'} (${modelToUse}) using endpoint ${endpoint} with ${geminiContents.length} history turns` + (systemPrompt ? " and system instruction." : "."));

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
        console.error(`Non-JSON response from ${connectionMethod} endpoint (${response.status} ${response.statusText}):`, errorBodyText);
        throw new Error(`API Error (${response.status} ${response.statusText}). Response: ${errorBodyText.substring(0, 200)}`);
      }

      console.log(`${connectionMethod === 'proxy' ? 'Proxy' : 'Gemini'} API Response Data:`, data);

      if (!response.ok) {
        let detailedError = `API Error via ${connectionMethod} (${response.status} ${response.statusText})`;
        if (data && data.error) {
          if (typeof data.error === 'string') {
            detailedError += `: ${data.error}`;
          } else if (data.error.message) {
            detailedError += `: ${data.error.message}`;
            if (data.error.details) console.error(`Gemini Error Details via ${connectionMethod}:`, data.error.details);
          } else {
            detailedError += `. Response: ${JSON.stringify(data.error).substring(0, 200)}`;
          }
        } else if (data) {
          detailedError += `. Response: ${JSON.stringify(data).substring(0, 200)}`;
        }
        console.error(`API Error Response (Via ${connectionMethod} - ${response.status} ${response.statusText}):`, data);
        throw new Error(detailedError);
      }

      let responseText = `Error: Could not parse ${connectionMethod === 'proxy' ? 'proxied' : ''} Gemini response.`;
      try {
        if (data.candidates && data.candidates[0]?.content?.parts) {
          responseText = data.candidates[0].content.parts
            .filter(part => part.text)
            .map(part => part.text)
            .join('');
        } else if (data.promptFeedback?.blockReason) {
          responseText = `Request blocked by API: ${data.promptFeedback.blockReason}`;
          if (data.promptFeedback.safetyRatings) {
            responseText += ` - Details: ${data.promptFeedback.safetyRatings.map(r => `${r.category}: ${r.probability}`).join(', ')}`;
          }
          console.warn(`Gemini request blocked (via ${connectionMethod}):`, data.promptFeedback);
        } else if (data.candidates && data.candidates[0]?.finishReason && data.candidates[0].finishReason !== "STOP") {
          responseText = `Request finished unexpectedly. Reason: ${data.candidates[0].finishReason}`;
          const safetyRatingsInfo = data.candidates[0].safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ');
          if (safetyRatingsInfo) responseText += ` (Safety Ratings: ${safetyRatingsInfo})`;
          if (data.candidates[0].content?.parts?.some(p => p.text)) {
            const partialText = data.candidates[0].content.parts.filter(p => p.text).map(p => p.text).join('');
            responseText += `\nPartial content: ${partialText}`;
          }
          console.warn(`Gemini request finished with reason (via ${connectionMethod}): ${data.candidates[0].finishReason}`, data.candidates[0]);
        } else if (data.error) {
          responseText = `${connectionMethod === 'proxy' ? 'Proxied ' : ''}Gemini API Error: ${data.error.message || 'Unknown error'}`;
          console.error(`${connectionMethod === 'proxy' ? 'Proxied ' : ''}Gemini API returned error object:`, data.error);
        } else {
          console.warn(`Unexpected ${connectionMethod === 'proxy' ? 'proxied ' : ''}Gemini response structure:`, data);
        }
      } catch (parseError) {
        console.error(`Error parsing ${connectionMethod === 'proxy' ? 'proxied ' : ''}Gemini response content:`, parseError, data);
        responseText = `Error: Failed to process ${connectionMethod === 'proxy' ? 'proxied ' : ''}Gemini response content.`;
      }
      return responseText;

    } catch (error) {
      console.error(`Error during ${connectionMethod} Gemini fetch or response processing:`, error);
      if (error instanceof Error && error.message.startsWith('API Error')) {
        throw error;
      } else {
        throw new Error(`Failed to communicate with ${connectionMethod} endpoint or process response: ${error.message}`);
      }
    }
  }

  async sendRequest(apiConfig, messagesHistory, currentPayload, imageDataUrl = null, systemPrompt = null) {
    console.log(`ApiService.sendRequest called. Mode: ${apiConfig.activeApiMode}, Image provided: ${!!imageDataUrl}, System Prompt Provided: ${!!systemPrompt}`);
    console.log("Using API Config:", apiConfig);

    let rawBase64 = null;
    let mimeType = 'image/png';

    if (imageDataUrl) {
      rawBase64 = stripBase64Prefix(imageDataUrl);
      if (rawBase64) {
        const mimeTypeMatch = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
        if (mimeTypeMatch) {
          mimeType = mimeTypeMatch[1];
          console.log(`Detected image MIME type: ${mimeType}`);
        } else {
          console.warn("Could not detect specific image MIME type from data URL, using default:", mimeType);
        }
      } else {
        imageDataUrl = null;
        rawBase64 = null;
        console.warn("Proceeding with API request without image due to processing failure.");
      }
    }

    try {
      if (apiConfig.activeApiMode === 'local') {
        return await this._sendOllamaRequest(apiConfig, messagesHistory, currentPayload, rawBase64, mimeType, systemPrompt);
      } else if (apiConfig.activeApiMode === 'cloud') {
        return await this._sendGeminiRequest(apiConfig, messagesHistory, currentPayload, rawBase64, mimeType, systemPrompt);
      } else {
        throw new Error('Invalid API mode selected.');
      }
    } catch (error) {
      console.error("Error during API request dispatch:", error);
      throw error;
    }
  }
}