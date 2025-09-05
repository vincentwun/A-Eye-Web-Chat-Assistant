function formatMessagesForFoundryResponses(messages, mimeType = 'image/png') {
    return messages.map(message => {
        if (message.role === 'assistant' || message.role === 'system') {
            return {
                role: message.role,
                content: message.content
            };
        }

        if (message.role === 'user') {
            const contentParts = [];

            if (message.content) {
                contentParts.push({
                    type: 'input_text',
                    text: message.content
                });
            }

            if (message.images && message.images.length > 0) {
                message.images.forEach(base64Image => {
                    contentParts.push({
                        type: 'input_image',
                        image_url: `data:${mimeType};base64,${base64Image}`
                    });
                });
            }

            if (contentParts.length === 0) {
                return { role: 'user', content: '' };
            }

            return {
                role: 'user',
                content: contentParts
            };
        }

        return message;
    });
}

export async function sendAzureFoundryRequest(apiConfig, messages, mimeType = 'image/png') {
    const { apimEndpoint, apimSubscriptionKey, azureFoundryModelName } = apiConfig;

    if (!apimEndpoint || !apimSubscriptionKey || !azureFoundryModelName) {
        throw new Error("Azure APIM endpoint, subscription key, or model name is not configured.");
    }

    const formattedMessages = formatMessagesForFoundryResponses(messages, mimeType);

    const body = {
        input: formattedMessages,
        model: azureFoundryModelName,
        max_output_tokens: 4096,
        stream: false
    };

    try {
        const apiVersion = "2025-03-01-preview";
        const operationPath = `responses?api-version=${apiVersion}`;

        const baseEndpoint = apimEndpoint.endsWith('/') ? apimEndpoint.slice(0, -1) : apimEndpoint;
        const fullUrl = `${baseEndpoint}/${operationPath}`;

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apimSubscriptionKey
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Azure APIM API Error:", errorBody);
            throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        }

        const data = await response.json();

        if (data.output && Array.isArray(data.output)) {
            const messageOutput = data.output.find(o => o.type === 'message');
            if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
                const textContent = messageOutput.content.find(c => c.type === 'output_text');
                if (textContent) {
                    return textContent.text;
                }
            }
        }

        return "No response content received.";

    } catch (error) {
        console.error('Error sending request to Azure APIM:', error);
        throw error;
    }
}