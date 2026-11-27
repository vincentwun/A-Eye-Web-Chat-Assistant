import { formatOpenAICompatibleMessages, type StandardMessage } from './openaiMessageFormat.ts';
import { postOpenAICompletion } from './openaiCompletionRequest.ts';

export async function sendVllmRequest(apiConfig: { localApiUrl?: string; vllmModelName?: string }, standardMessages: StandardMessage[]) {
    const apiUrl = apiConfig.localApiUrl;
    const model = apiConfig.vllmModelName;

    if (!apiUrl) throw new Error('vLLM Server URL is not set.');
    if (!model) throw new Error('vLLM model name is not set.');

    let endpoint;
    try {
        endpoint = new URL('/v1/chat/completions', apiUrl).toString();
    } catch (e) {
        throw new Error(`Invalid vLLM Server URL provided: ${apiUrl}`);
    }

    const formattedMessages = formatOpenAICompatibleMessages(standardMessages);

    if (formattedMessages.length === 0) {
        throw new Error("Cannot send an empty request to vLLM.");
    }

    const data = await postOpenAICompletion(endpoint, {
        model: model,
        messages: formattedMessages,
        max_tokens: 4096,
        stream: false
    });

    if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
        return data.choices[0].message.content;
    }
    return 'Error: Could not parse vLLM response.';
}
