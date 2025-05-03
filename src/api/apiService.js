import { sendOllamaRequest } from './ollamaApi.js';
import { sendGeminiRequest } from './geminiApi.js';

const MAX_HISTORY_MESSAGES = 10;

function stripBase64Prefix(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    return null;
  }
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    return null;
  }
  return dataUrl.substring(commaIndex + 1);
}

export class ApiService {

  async sendRequest(apiConfig, messagesHistory, currentPayload, imageDataUrl = null, systemPrompt = null) {
    let rawBase64 = null;
    let mimeType = 'image/png';

    if (imageDataUrl) {
      rawBase64 = stripBase64Prefix(imageDataUrl);
      if (rawBase64) {
        const mimeTypeMatch = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
        if (mimeTypeMatch) {
          mimeType = mimeTypeMatch[1];
        }
      } else {
        imageDataUrl = null;
        rawBase64 = null;
      }
    }

    try {
      if (apiConfig.activeApiMode === 'local') {
        return await sendOllamaRequest(
          apiConfig,
          messagesHistory,
          currentPayload,
          rawBase64,
          mimeType,
          systemPrompt,
          MAX_HISTORY_MESSAGES
        );
      } else if (apiConfig.activeApiMode === 'cloud') {
        return await sendGeminiRequest(
          apiConfig,
          messagesHistory,
          currentPayload,
          rawBase64,
          mimeType,
          systemPrompt,
          MAX_HISTORY_MESSAGES
        );
      } else {
        throw new Error('Invalid API mode selected.');
      }
    } catch (error) {
      console.error("Error during API request dispatch:", error);
      throw error;
    }
  }
}