import { formatOpenAICompatibleMessages, type StandardMessage } from './openaiMessageFormat.ts';
import { postOpenAICompletion } from './openaiCompletionRequest.ts';
const DEFAULT_LMSTUDIO_URL = 'http://localhost:1234';

export async function sendLmstudioRequest(apiConfig: { lmstudioModelName?: string }, standardMessages: StandardMessage[]) {
  const apiUrl = DEFAULT_LMSTUDIO_URL;
  const model = apiConfig.lmstudioModelName;

  if (!model) throw new Error('LM Studio model name is not set.');

  let endpoint;
  try {
    endpoint = new URL('/v1/chat/completions', apiUrl).toString();
  } catch (e) {
    throw new Error(`Invalid LM Studio URL provided: ${apiUrl}`);
  }

  const formattedMessages = formatOpenAICompatibleMessages(standardMessages);

  if (formattedMessages.length === 0) {
    throw new Error("Cannot send an empty request to LM Studio.");
  }

  const data = await postOpenAICompletion(endpoint, {
    model: model,
    messages: formattedMessages,
    stream: false
  });

  if (data.choices && data.choices.length > 0 && data.choices[0].message) {
    return data.choices[0].message.content;
  }
  return 'Error: Could not parse LM Studio response.';
}
