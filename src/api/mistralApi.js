export async function sendMistralRequest(apiConfig, standardMessages, mimeType) {
    if (!apiConfig.mistralApiKey) {
        throw new Error('Mistral API Key not configured.');
    }
    if (!apiConfig.mistralModelName) {
        throw new Error('Mistral model name not set.');
    }

    const endpoint = 'https://api.mistral.ai/v1/chat/completions';
    const apiKey = apiConfig.mistralApiKey;
    const modelToUse = apiConfig.mistralModelName;

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    const mistralMessages = [];
    for (const message of standardMessages) {
        if (!message.content && !message.images) continue;

        let contentParts = [];
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

        mistralMessages.push({
            role: message.role === 'system' ? 'system' : (message.role === 'assistant' ? 'assistant' : 'user'),
            content: contentParts
        });
    }

    if (mistralMessages.length === 0) {
        throw new Error("Cannot send empty request to Mistral.");
    }

    const body = JSON.stringify({
        model: modelToUse,
        messages: mistralMessages,
        max_tokens: 4096
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

        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content || "";
        } else {
            throw new Error("Could not parse Mistral response.");
        }

    } catch (error) {
        if (error instanceof Error && error.message.startsWith('API Error')) {
            throw error;
        }
        throw new Error(`Failed to communicate with Mistral endpoint: ${error.message}`);
    }
}