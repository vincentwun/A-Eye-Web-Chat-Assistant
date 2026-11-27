export type StandardMessage = {
  role: string;
  content?: string | null;
  images?: string[] | null;
};

export function formatOpenAICompatibleMessages(messages: StandardMessage[]) {
  return messages.map(message => {
    const content: ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] = [];
    if (message.content) content.push({ type: 'text', text: message.content });
    for (const image of message.images ?? []) {
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } });
    }
    return { role: message.role === 'assistant' ? 'assistant' : 'user', content };
  });
}

