function formatMessagesForVllm(standardMessages) {
    return standardMessages.map(msg => {
        const contentParts = [];
        if (msg.content) {
            contentParts.push({ type: 'text', text: msg.content });
        }

        if (msg.images && msg.images.length > 0) {
            msg.images.forEach(base64Image => {
                contentParts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:image/jpeg;base64,${base64Image}`
                    }
                });
            });
        }

        return {
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: contentParts
        };
    }).filter(msg => msg.role !== 'system');
}

export async function sendVllmRequest(apiConfig, standardMessages) {
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

    const headers = { 'Content-Type': 'application/json' };

    const formattedMessages = formatMessagesForVllm(standardMessages);

    if (formattedMessages.length === 0) {
        throw new Error("Cannot send an empty request to vLLM.");
    }

    const body = JSON.stringify({
        model: model,
        messages: formattedMessages,
        max_tokens: 4096,
        stream: false
    });

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: body
        });

        if (!response.ok) {
            let errorBodyText = '';
            try { errorBodyText = await response.text(); } catch (e) { /* ignore */ }
            let detailedError = `API Error (${response.status} ${response.statusText})`;
            if (errorBodyText) {
                try {
                    const errorJson = JSON.parse(errorBodyText);
                    detailedError += `: ${errorJson.error?.message || errorBodyText.substring(0, 200)}`;
                } catch (e) {
                    detailedError += `. Response: ${errorBodyText.substring(0, 200)}`;
                }
            }
            throw new Error(detailedError);
        }

        const data = await response.json();

        if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
            return data.choices[0].message.content;
        }

        return 'Error: Could not parse vLLM response.';

    } catch (error) {
        throw error;
    }
}