import type { Content, GenerateContentResponse, Part } from '@google/genai';
import type { StandardMessage } from './openaiMessageFormat.ts';

type GeminiConfig = {
  cloudApiMethod?: string;
  cloudModelName?: string;
  cloudProxyUrl?: string;
  gcpApiKey?: string;
  cloudApiKey?: string;
};
type GeminiPart = { text?: string; inline_data?: { mime_type?: string; data: string } };
type SafetyRating = { category?: string; probability?: string };
type GeminiResponseText = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    safetyRatings?: SafetyRating[];
  }>;
  promptFeedback?: { blockReason?: string; safetyRatings?: SafetyRating[] };
  error?: string | { message?: string };
  text?: string;
};
type GeminiProxyPayload = {
  contents: { role: 'user' | 'model'; parts: GeminiPart[] }[];
  tools?: object[];
  systemInstruction?: { parts: { text: string }[] };
  generationConfig?: { thinkingConfig: { thinkingBudget: number } };
};

const GEMINI_TOOLS = [{ urlContext: {} }, { googleSearch: {} }];
const MODELS_WITH_DYNAMIC_THINKING = new Set(['gemini-2.5-flash']);
const GEMMA_MODELS = new Set(['gemma-4-26b-a4b-it', 'gemma-4-31b-it']);

function createContents(messages: StandardMessage[], mimeType?: string) {
  let systemInstruction: Content | undefined;
  const messagesToProcess = [...messages];

  if (messagesToProcess[0]?.role === 'system') {
    const systemMessage = messagesToProcess.shift();
    if (systemMessage?.content) {
      systemInstruction = { parts: [{ text: systemMessage.content }] };
    }
  }

  const contents: Content[] = [];
  for (const message of messagesToProcess) {
    const role = message.role === 'assistant' ? 'model' : 'user';
    const parts: Part[] = [];

    if (message.content) parts.push({ text: message.content });
    if (message.images?.length && role === 'user') {
      for (const data of message.images) {
        parts.push({ inlineData: { mimeType, data } });
      }
    }
    if (parts.length) contents.push({ role, parts });
  }

  if (contents[0]?.role === 'model') contents.shift();
  return { contents, systemInstruction };
}

function toProxyPayload(
  contents: Content[],
  systemInstruction: Content | undefined,
  model: string,
): GeminiProxyPayload {
  const payload: GeminiProxyPayload = {
    contents: contents.map(content => ({
      role: content.role as 'user' | 'model',
      parts: (content.parts ?? []).map(part => ({
        ...(part.text !== undefined ? { text: part.text } : {}),
        ...(part.inlineData
          ? {
              inline_data: {
                ...(part.inlineData.mimeType ? { mime_type: part.inlineData.mimeType } : {}),
                data: part.inlineData.data ?? '',
              },
            }
          : {}),
      })),
    })),
    ...(!GEMMA_MODELS.has(model) && { tools: GEMINI_TOOLS }),
    ...(systemInstruction && {
      systemInstruction: {
        parts: (systemInstruction.parts ?? []).flatMap(part =>
          part.text === undefined ? [] : [{ text: part.text }],
        ),
      },
    }),
  };

  if (MODELS_WITH_DYNAMIC_THINKING.has(model)) {
    payload.generationConfig = { thinkingConfig: { thinkingBudget: -1 } };
  }
  return payload;
}

function formatResponseText(data: GeminiResponseText, connectionMethod: string) {
  const candidate = data.candidates?.[0];
  if (candidate?.content?.parts) {
    const responseText = data.text || candidate.content.parts
      .map(part => part.text)
      .filter((text): text is string => Boolean(text))
      .join('');
    if (responseText) return responseText;
    return `Error: Could not parse ${connectionMethod === 'proxy' ? 'proxied ' : ''}Gemini response.`;
  }

  if (data.promptFeedback?.blockReason) {
    const ratings = data.promptFeedback.safetyRatings;
    const details = ratings?.length
      ? ` - Details: ${ratings.map(rating => `${rating.category}: ${rating.probability}`).join(', ')}`
      : '';
    return `Request blocked by API: ${data.promptFeedback.blockReason}${details}`;
  }

  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    let responseText = `Request finished unexpectedly. Reason: ${candidate.finishReason}`;
    const ratings = candidate.safetyRatings
      ?.map(rating => `${rating.category}: ${rating.probability}`)
      .join(', ');
    if (ratings) responseText += ` (Safety Ratings: ${ratings})`;
    const partialText = candidate.content?.parts
      ?.map(part => part.text)
      .filter((text): text is string => Boolean(text))
      .join('');
    if (partialText) responseText += `\nPartial content: ${partialText}`;
    return responseText;
  }

  if (data.error) {
    const detail = typeof data.error === 'string' ? data.error : data.error.message || 'Unknown error';
    return `${connectionMethod === 'proxy' ? 'Proxied ' : ''}Gemini API Error: ${detail}`;
  }

  return `Error: Could not parse ${connectionMethod === 'proxy' ? 'proxied ' : ''}Gemini response.`;
}

async function sendDirectGeminiRequest(
  apiKey: string,
  model: string,
  contents: Content[],
  systemInstruction?: Content,
) {
  let ApiErrorType: typeof import('@google/genai').ApiError | undefined;
  try {
    const { ApiError, GoogleGenAI } = await import('@google/genai');
    ApiErrorType = ApiError;
    const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        ...(!GEMMA_MODELS.has(model) && { tools: GEMINI_TOOLS }),
        ...(systemInstruction && { systemInstruction }),
        ...(MODELS_WITH_DYNAMIC_THINKING.has(model) && {
          thinkingConfig: { thinkingBudget: -1 },
        }),
        // Match the existing single-request behavior instead of silently issuing follow-up calls.
        automaticContinuation: false,
      },
    });
    return formatResponseText(response as GenerateContentResponse, 'direct');
  } catch (error) {
    if (ApiErrorType && error instanceof ApiErrorType) {
      throw new Error(`API Error via direct (${error.status}): ${error.message}`);
    }
    throw new Error(
      `Failed to communicate with direct endpoint or process response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function sendProxyGeminiRequest(
  apiConfig: GeminiConfig,
  model: string,
  contents: Content[],
  systemInstruction?: Content,
) {
  const endpoint = apiConfig.cloudProxyUrl;
  const apiKey = apiConfig.gcpApiKey;
  if (!endpoint) throw new Error('API Gateway Endpoint not configured for Vertex AI (GCP) method.');
  if (!apiKey) throw new Error('GCP API Key not configured for Vertex AI (GCP) method.');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'X-Model-Name': model,
    },
    body: JSON.stringify(toProxyPayload(contents, systemInstruction, model)),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    const responseText = await response.text();
    throw new Error(`API Error (${response.status} ${response.statusText}). Response: ${responseText.substring(0, 200)}`);
  }

  if (!response.ok) {
    let detail = `API Error via proxy (${response.status} ${response.statusText})`;
    if (data?.error) {
      if (typeof data.error === 'string') detail += `: ${data.error}`;
      else if (data.error.message) detail += `: ${data.error.message}`;
      else detail += `. Response: ${JSON.stringify(data.error).substring(0, 200)}`;
    } else if (data) {
      detail += `. Response: ${JSON.stringify(data).substring(0, 200)}`;
    }
    throw new Error(detail);
  }

  return formatResponseText(data, 'proxy');
}

export async function sendGeminiRequest(
  apiConfig: GeminiConfig,
  standardMessages: StandardMessage[],
  mimeType?: string,
) {
  const connectionMethod = apiConfig.cloudApiMethod || 'direct';
  const model = apiConfig.cloudModelName;
  if (!model) throw new Error('Cloud Gemini model name not set.');

  const { contents, systemInstruction } = createContents(standardMessages, mimeType);
  if (!contents.length) {
    throw new Error(`Cannot send empty request to Gemini via ${connectionMethod} method.`);
  }

  if (connectionMethod === 'proxy') {
    return sendProxyGeminiRequest(apiConfig, model, contents, systemInstruction);
  }

  const apiKey = apiConfig.cloudApiKey;
  if (!apiKey) throw new Error('Cloud Gemini API Key not configured.');
  return sendDirectGeminiRequest(apiKey, model, contents, systemInstruction);
}
