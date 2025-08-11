async function base64ToBlob(dataUrl, mimeType = 'image/png') {
    if (!dataUrl.startsWith('data:')) {
        dataUrl = `data:${mimeType};base64,${dataUrl}`;
    }
    const res = await fetch(dataUrl);
    return await res.blob();
}

async function resolveInjectionTarget() {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id && /^https?:/i.test(active.url || '')) {
        return { tabId: active.id, cleanup: null };
    }
    throw new Error('No suitable page found for Gemini Nano injection. Please switch to a regular web page (http/https).');
}

async function buildPromptPayload(messages, forInjection = false) {
    const payload = [];
    let hasImage = false;

    for (const msg of messages) {
        if (!msg.content && (!msg.images || msg.images.length === 0)) {
            continue;
        }

        const contentParts = [];
        if (msg.content) {
            contentParts.push({ type: 'text', value: msg.content });
        }

        if (msg.images && msg.images.length > 0) {
            hasImage = true;
            for (const imgBase64 of msg.images) {
                if (forInjection) {
                    contentParts.push({ type: 'image', value: `data:image/png;base64,${imgBase64}` });
                } else {
                    const blob = await base64ToBlob(imgBase64);
                    contentParts.push({ type: 'image', value: blob });
                }
            }
        }
        payload.push({ role: msg.role, content: contentParts });
    }
    return { payload, hasImage };
}


export async function sendGeminiNanoRequest(apiConfig, standardMessages) {
    try {
        const { payload, hasImage } = await buildPromptPayload(standardMessages, false);
        if (payload.length === 0) throw new Error("Cannot send an empty request to Gemini Nano.");

        const sessionOptions = {};
        if (hasImage) {
            sessionOptions.expectedInputs = [{ type: 'image' }];
        }

        let session;
        let reply;

        if (globalThis.ai?.canCreateTextSession) {
            const state = await globalThis.ai.canCreateTextSession();
            if (state === 'readily') {
                session = await globalThis.ai.createTextSession(sessionOptions);
                reply = await session.prompt(payload);
                session.destroy();
                return reply;
            } else {
                console.warn(`Gemini Nano not readily available in sidepanel (state: ${state}). Falling back to injection.`);
            }
        } else if (globalThis.LanguageModel?.create) {
            session = await globalThis.LanguageModel.create(sessionOptions);
            reply = await session.prompt(payload);
            session.destroy();
            return reply;
        }
    } catch (e) {
        console.warn("Direct Gemini Nano access in sidepanel failed, falling back to injection:", e);
    }

    const { tabId, cleanup } = await resolveInjectionTarget();
    try {
        const { payload: injectionPayload, hasImage } = await buildPromptPayload(standardMessages, true);
        if (injectionPayload.length === 0) throw new Error("Cannot send an empty request to Gemini Nano.");

        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: async (promptPayload, containsImage) => {
                const base64ToBlobInjected = async (dataUrl) => {
                    const res = await fetch(dataUrl);
                    return await res.blob();
                };

                try {
                    for (const msg of promptPayload) {
                        for (const part of msg.content) {
                            if (part.type === 'image') {
                                part.value = await base64ToBlobInjected(part.value);
                            }
                        }
                    }

                    const sessionOptions = {};
                    if (containsImage) {
                        sessionOptions.expectedInputs = [{ type: 'image' }];
                    }

                    let session;

                    if (globalThis.ai?.canCreateTextSession) {
                        const state = await globalThis.ai.canCreateTextSession();
                        if (state !== 'readily') return { error: `unavailable:${state}` };
                        session = await globalThis.ai.createTextSession(sessionOptions);
                    } else if (globalThis.LanguageModel?.create) {
                        session = await globalThis.LanguageModel.create(sessionOptions);
                    } else {
                        return { error: 'no-api' };
                    }

                    const reply = await session.prompt(promptPayload);
                    session.destroy();
                    return { reply };

                } catch (e) {
                    return { error: e?.message || String(e) };
                }
            },
            args: [injectionPayload, hasImage]
        });

        if (!result) throw new Error('Injection failed: no result.');
        if (result.error) {
            if (result.error.startsWith('unavailable:')) {
                const code = result.error.split(':')[1];
                const map = { 'no': 'Permission not granted.', 'after-download': 'Model is downloading. Try again later.' };
                throw new Error(map[code] ?? 'Gemini Nano is not ready.');
            }
            if (result.error === 'no-api') throw new Error('The page cannot access Gemini Nano API.');
            throw new Error(result.error);
        }
        return result.reply;
    } finally {
        if (cleanup) await cleanup();
    }
}