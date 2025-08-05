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

export async function sendMistralRequest(apiConfig, standardMessages, mimeType) {
    if (!apiConfig.mistralApiKey) {
        throw new Error('Mistral API Key not configured.');
    }
    if (!apiConfig.mistralModelName) {
        throw new Error('Mistral model name not set.');
    }

    const endpoint = 'https://api.mistral.ai/v1/conversations';
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiConfig.mistralApiKey}`
    };

    const systemPrompt = standardMessages.find(m => m.role === 'system')?.content ||
        "You are a helpful assistant. Use your websearch abilities to find up-to-date information when needed.";

    const inputs = [];
    for (const message of standardMessages) {
        if (message.role === 'system' || (!message.content && !message.images)) continue;

        const contentParts = [];
        if (message.content) {
            contentParts.push({
                type: 'text',
                text: message.content
            });
        }

        if (message.role === 'user' && message.images && message.images.length > 0) {
            for (const imgData of message.images) {
                contentParts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${mimeType};base64,${imgData}`
                    }
                });
            }
        }

        if (contentParts.length > 0) {
            inputs.push({
                role: message.role,
                content: contentParts
            });
        }
    }

    if (inputs.length === 0) {
        throw new Error("Cannot send empty request to Mistral.");
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

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: body
        });

        const data = await response.json();

        if (!response.ok) {
            let detail = `API Error (${response.status})`;
            if (data && data.message) {
                detail += `: ${data.message}`;
            } else if (data && data.error && data.error.message) {
                detail += `: ${data.error.message}`;
            }
            throw new Error(detail);
        }

        if (data.outputs) {
            return processConversationResponse(data.outputs);
        } else {
            throw new Error("Could not parse Mistral conversation response.");
        }

    } catch (error) {
        console.error("Failed to communicate with Mistral conversation endpoint:", error);
        throw error;
    }
}