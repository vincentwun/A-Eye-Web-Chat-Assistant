import { sendOllamaRequest } from './ollamaApi.ts';
import { sendLmstudioRequest } from './lmstudioApi.ts';
import { sendVllmRequest } from './vllmApi.ts';
import { sendGeminiNanoRequest } from './geminiNanoApi.ts';
import { sendGeminiRequest } from './geminiApi.ts';
import { sendMistralRequest } from './mistralApi.ts';
import { sendAzureFoundryRequest } from './azureFoundryApi.ts';
import type { defaultApiSettings } from '../option/apiRoute.ts';

type ApiConfig = Partial<typeof defaultApiSettings>;
type ChatMessage = { role: string; content: string; images?: string[] | null };

const MAX_HISTORY_MESSAGES = 10;

function stripBase64Prefix(dataUrl: string | null) {
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

    _processResponseContent(rawContent: unknown) {
        if (typeof rawContent !== 'string') {
            return rawContent;
        }
        const thinkTagEnd = '</think>';
        const thinkTagIndex = rawContent.lastIndexOf(thinkTagEnd);

        if (thinkTagIndex !== -1) {
            return rawContent.substring(thinkTagIndex + thinkTagEnd.length).trim();
        }
        return rawContent;
    }

    _prepareStandardMessages(messagesHistory: ChatMessage[], currentPayload: { prompt?: string | null }, rawBase64: string | null, systemPrompt: string | null, maxHistory: number) {
        const standardMessages: ChatMessage[] = [];

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

    async sendRequest(apiConfig: ApiConfig, messagesHistory: ChatMessage[], currentPayload: { prompt?: string | null }, imageDataUrl: string | null = null, systemPrompt: string | null = null) {
        let rawBase64: string | null = null;
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
            let responseContent;
            if (apiConfig.activeApiMode === 'local') {
                switch (apiConfig.localApiMode) {
                    case 'ollama':
                        responseContent = await sendOllamaRequest(apiConfig, standardMessages);
                        break;
                    case 'lmstudio':
                        responseContent = await sendLmstudioRequest(apiConfig, standardMessages);
                        break;
                    case 'vllm':
                        responseContent = await sendVllmRequest(apiConfig, standardMessages);
                        break;
                    case 'gemini-nano':
                        responseContent = await sendGeminiNanoRequest(apiConfig, standardMessages);
                        break;
                    default:
                        throw new Error(`Unsupported local API mode: ${apiConfig.localApiMode}`);
                }
            } else if (apiConfig.activeApiMode === 'cloud') {
                if (apiConfig.cloudProvider === 'mistral') {
                    responseContent = await sendMistralRequest(apiConfig, standardMessages, mimeType);
                } else if (apiConfig.cloudProvider === 'azure-foundry') {
                    responseContent = await sendAzureFoundryRequest(apiConfig, standardMessages, mimeType);
                } else {
                    responseContent = await sendGeminiRequest(apiConfig, standardMessages, mimeType);
                }
            } else {
                throw new Error('Invalid API mode selected.');
            }
            return this._processResponseContent(responseContent);
        } catch (error) {
            console.error("Error during API request dispatch:", error);
            throw error;
        }
    }
}
