import type { StandardMessage } from './openaiMessageFormat.ts';

type NanoPart = { type: string; value: string | Blob };
type NanoMessage = { role: string; content: NanoPart[] };
type NanoOptions = { expectedInputs?: { type: string }[] };
type NanoSession = { prompt(messages: NanoMessage[]): Promise<string>; destroy(): void };
type NanoGlobal = typeof globalThis & {
    ai?: { canCreateTextSession(): Promise<string>; createTextSession(options: NanoOptions): Promise<NanoSession> };
    LanguageModel?: { create(options: NanoOptions): Promise<NanoSession> };
};

async function base64ToBlob(dataUrl: string, mimeType = 'image/png') {
    if (!dataUrl.startsWith('data:')) {
        dataUrl = `data:${mimeType};base64,${dataUrl}`;
    }
    const res = await fetch(dataUrl);
    return await res.blob();
}

async function resolveInjectionTarget(): Promise<{ tabId: number; cleanup: (() => Promise<void>) | null }> {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id && /^https?:/i.test(active.url || '')) {
        return { tabId: active.id, cleanup: null };
    }
    throw new Error('No suitable page found for Gemini Nano injection. Please switch to a regular web page (http/https).');
}

async function buildPromptPayload(messages: StandardMessage[], forInjection = false) {
    const payload: NanoMessage[] = [];
    let hasImage = false;

    for (const msg of messages) {
        if (!msg.content && (!msg.images || msg.images.length === 0)) {
            continue;
        }

        const contentParts: NanoPart[] = [];
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


export async function sendGeminiNanoRequest(_apiConfig: unknown, standardMessages: StandardMessage[]) {
    try {
        const { payload, hasImage } = await buildPromptPayload(standardMessages, false);
        if (payload.length === 0) throw new Error("Cannot send an empty request to Gemini Nano.");

        const sessionOptions: NanoOptions = {};
        if (hasImage) {
            sessionOptions.expectedInputs = [{ type: 'image' }];
        }

        let session;
        let reply;

        const nano = globalThis as NanoGlobal;
        if (nano.ai?.canCreateTextSession) {
            const state = await nano.ai.canCreateTextSession();
            if (state === 'readily') {
                session = await nano.ai.createTextSession(sessionOptions);
                reply = await session.prompt(payload);
                session.destroy();
                return reply;
            } else {
                console.warn(`Gemini Nano not readily available in sidepanel (state: ${state}). Falling back to injection.`);
            }
        } else if (nano.LanguageModel?.create) {
            session = await nano.LanguageModel.create(sessionOptions);
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
            func: async (promptPayload: NanoMessage[], containsImage: boolean) => {
                const base64ToBlobInjected = async (dataUrl: string) => {
                    const res = await fetch(dataUrl);
                    return await res.blob();
                };

                try {
                    for (const msg of promptPayload) {
                        for (const part of msg.content) {
                            if (part.type === 'image') {
                                part.value = await base64ToBlobInjected(part.value as string);
                            }
                        }
                    }

                    const sessionOptions: NanoOptions = {};
                    if (containsImage) {
                        sessionOptions.expectedInputs = [{ type: 'image' }];
                    }

                    let session;

                    const nano = globalThis as NanoGlobal;
                    if (nano.ai?.canCreateTextSession) {
                        const state = await nano.ai.canCreateTextSession();
                        if (state !== 'readily') return { error: `unavailable:${state}` };
                        session = await nano.ai.createTextSession(sessionOptions);
                    } else if (nano.LanguageModel?.create) {
                        session = await nano.LanguageModel.create(sessionOptions);
                    } else {
                        return { error: 'no-api' };
                    }

                    const reply = await session.prompt(promptPayload);
                    session.destroy();
                    return { reply };

                } catch (e) {
                    return { error: e instanceof Error ? e.message : String(e) };
                }
            },
            args: [injectionPayload, hasImage]
        });

        if (!result) throw new Error('Injection failed: no result.');
        if (result.error) {
            if (result.error.startsWith('unavailable:')) {
                const code = result.error.split(':')[1];
                const map: Record<string, string> = { 'no': 'Permission not granted.', 'after-download': 'Model is downloading. Try again later.' };
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
