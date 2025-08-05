import { sendOllamaRequest } from './ollamaApi.js';
import { sendGeminiRequest } from './geminiApi.js';
import { sendMistralRequest } from './mistralApi.js';
import { sendLmstudioRequest } from './lmstudioApi.js';

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

    _prepareStandardMessages(messagesHistory, currentPayload, rawBase64, systemPrompt, maxHistory) {
        const standardMessages = [];

        if (systemPrompt) {
            standardMessages.push({ role: 'system', content: systemPrompt });
        }

        const relevantHistory = messagesHistory.slice(-maxHistory);

        for (const message of relevantHistory) {
            if ((message.role === 'user' || message.role === 'assistant') && message.content) {
                const lastMessage = standardMessages.length > 0 ? standardMessages[standardMessages.length - 1] : null;
                if (lastMessage && lastMessage.role === message.role && !lastMessage.images) {
                    lastMessage.content += "\n" + message.content;
                } else {
                    standardMessages.push({ role: message.role, content: message.content, images: null });
                }
            }
        }

        const currentUserContent = currentPayload.prompt || "";
        const currentUserImage = rawBase64 ? [rawBase64] : null;

        if (currentUserContent || currentUserImage) {
            const lastMessage = standardMessages.length > 0 ? standardMessages[standardMessages.length - 1] : null;

            if (lastMessage && lastMessage.role === 'user' && !lastMessage.images) {
                lastMessage.content = (lastMessage.content + "\n" + currentUserContent).trim();
                if (currentUserImage) {
                    lastMessage.images = currentUserImage;
                }
            } else {
                standardMessages.push({ role: 'user', content: currentUserContent, images: currentUserImage });
            }
        }

        return standardMessages;
    }

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
            }
        }

        const standardMessages = this._prepareStandardMessages(
            messagesHistory,
            currentPayload,
            rawBase64,
            systemPrompt,
            MAX_HISTORY_MESSAGES
        );

        const hasContent = standardMessages.some(m => (m.content && m.content.trim()) || (m.images && m.images.length > 0));
        if (!hasContent) {
            throw new Error("Cannot send an empty request.");
        }

        try {
            if (apiConfig.activeApiMode === 'local') {
                switch (apiConfig.localApiMode) {
                    case 'ollama':
                        return await sendOllamaRequest(apiConfig, standardMessages);
                    case 'lmstudio':
                        return await sendLmstudioRequest(apiConfig, standardMessages);
                    default:
                        return await sendOllamaRequest(apiConfig, standardMessages);
                }
            } else if (apiConfig.activeApiMode === 'cloud') {
                if (apiConfig.cloudProvider === 'mistral') {
                    return await sendMistralRequest(apiConfig, standardMessages, mimeType);
                }
                return await sendGeminiRequest(apiConfig, standardMessages, mimeType);
            } else {
                throw new Error('Invalid API mode selected.');
            }
        } catch (error) {
            console.error("Error during API request dispatch:", error);
            throw error;
        }
    }
}