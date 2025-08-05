function processConversationResponse(outputs) {
    let finalContent = "";
    const references = new Set();

    if (!outputs || !Array.isArray(outputs)) {
        return "";
    }

    const messageOutput = outputs.find(o => o.type === 'message.output');
    if (!messageOutput || !messageOutput.content) {
        return "";
    }

    const contentBlock = messageOutput.content;

    if (Array.isArray(contentBlock)) {
        contentBlock.forEach(chunk => {
            if (chunk.type === 'text' && chunk.text) {
                finalContent += chunk.text;
            } else if (chunk.type === 'tool_reference' && chunk.url) {
                const title = chunk.title || chunk.url;
                if (!finalContent.includes(chunk.url)) {
                    references.add(`[${title}](${chunk.url})`);
                }
            }
        });
    } else if (typeof contentBlock === 'string') {
        finalContent = contentBlock;
    } else {
        console.warn("Unrecognized Mistral message.output.content format:", contentBlock);
        return "";
    }

    if (references.size > 0) {
        finalContent = finalContent.trim();
        finalContent += "\n\n**Sources:**\n- " + [...references].join('\n- ');
    }

    return finalContent.trim();
}

async function _sendConversationsRequest(apiConfig, standardMessages) {
    const endpoint = 'https://api.mistral.ai/v1/conversations';
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiConfig.mistralApiKey}`
    };

    const systemPrompt = standardMessages.find(m => m.role === 'system')?.content ||
        "You are a helpful assistant. Use your websearch abilities to find up-to-date information when needed.";

    const inputs = standardMessages
        .filter(m => m.role !== 'system' && m.content)
        .map(m => ({ role: m.role, content: m.content }));

    if (inputs.length === 0) {
        throw new Error("Cannot send empty request to Mistral conversations endpoint.");
    }

    const body = JSON.stringify({
        model: apiConfig.mistralModelName,
        inputs: inputs,
        instructions: systemPrompt,
        tools: [{ type: "web_search" }],
        completion_args: {
            max_tokens: 4096
        }
    });

    const response = await fetch(endpoint, { method: 'POST', headers, body });
    const data = await response.json();

    if (!response.ok) {
        const detail = data?.message || data?.error?.message || `API Error (${response.status})`;
        throw new Error(`Mistral Conversations API: ${detail}`);
    }

    if (data.outputs) {
        return processConversationResponse(data.outputs);
    } else {
        throw new Error("Could not parse Mistral conversation response.");
    }
}

async function _sendChatCompletionsRequest(apiConfig, standardMessages, mimeType) {
    const endpoint = 'https://api.mistral.ai/v1/chat/completions';
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiConfig.mistralApiKey}`
    };

    const messages = standardMessages.map(message => {
        if (message.role === 'system') {
            return { role: 'system', content: message.content };
        }

        const contentParts = [];
        if (message.content) {
            contentParts.push({ type: 'text', text: message.content });
        }

        if (message.images && message.images.length > 0) {
            for (const imgData of message.images) {
                contentParts.push({
                    type: 'image_url',
                    image_url: `data:${mimeType};base64,${imgData}`
                });
            }
        }
        return { role: message.role, content: contentParts };
    }).filter(m => (Array.isArray(m.content) && m.content.length > 0) || (typeof m.content === 'string' && m.content));


    if (messages.length === 0) {
        throw new Error("Cannot send empty request to Mistral chat completions endpoint.");
    }

    const body = JSON.stringify({
        model: apiConfig.mistralModelName,
        messages: messages,
        max_tokens: 4096
    });

    const response = await fetch(endpoint, { method: 'POST', headers, body });
    const data = await response.json();

    if (!response.ok) {
        const detail = data?.message || data?.error?.message || `API Error (${response.status})`;
        throw new Error(`Mistral Chat API: ${detail}`);
    }

    if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content;
    } else {
        throw new Error("Could not parse Mistral chat completions response.");
    }
}


export async function sendMistralRequest(apiConfig, standardMessages, mimeType) {
    if (!apiConfig.mistralApiKey) {
        throw new Error('Mistral API Key not configured.');
    }
    if (!apiConfig.mistralModelName) {
        throw new Error('Mistral model name not set.');
    }

    const hasImage = standardMessages.some(m => m.images && m.images.length > 0);

    try {
        if (hasImage) {
            return await _sendChatCompletionsRequest(apiConfig, standardMessages, mimeType);
        } else {
            return await _sendConversationsRequest(apiConfig, standardMessages);
        }
    } catch (error) {
        console.error("Failed to communicate with Mistral endpoint:", error);
        throw error;
    }
}