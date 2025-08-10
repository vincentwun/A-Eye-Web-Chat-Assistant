async function waitTabComplete(tabId, timeoutMs = 5000) {
    const done = new Promise(resolve => {
        const listener = (id, info) => {
            if (id === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve(true);
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
    const timeout = new Promise(resolve => setTimeout(() => resolve(false), timeoutMs));
    return Promise.race([done, timeout]);
}

async function createEphemeralHiddenTarget() {
    const win = await chrome.windows.create({
        url: 'https://example.com/',
        type: 'popup',
        focused: false,
        left: -10000,
        top: 0,
        width: 1,
        height: 1
    });
    const tabId = win.tabs?.[0]?.id ?? (await chrome.tabs.query({ windowId: win.id }))[0]?.id;
    if (!tabId) {
        try { await chrome.windows.remove(win.id); } catch {}
        throw new Error('Failed to create hidden window.');
    }
    await waitTabComplete(tabId).catch(() => {});
    const cleanup = async () => { try { await chrome.windows.remove(win.id); } catch {} };
    return { tabId, cleanup };
}

async function resolveInjectionTarget() {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id && /^https?:/i.test(active.url || '')) return { tabId: active.id, cleanup: null };
    return await createEphemeralHiddenTarget();
}

export async function sendGeminiNanoRequest(apiConfig, standardMessages) {
    const prompt = standardMessages.map(m => `${m.role}: ${m.content ?? ''}`.trim()).join('\n');
    const { tabId, cleanup } = await resolveInjectionTarget();
    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: async (promptText) => {
                try {
                    if (globalThis.ai?.canCreateTextSession) {
                        const state = await globalThis.ai.canCreateTextSession();
                        if (state !== 'readily') return { error: `unavailable:${state}` };
                        const session = await globalThis.ai.createTextSession();
                        const reply = await session.prompt(promptText);
                        return { reply };
                    }
                    if (globalThis.LanguageModel?.create) {
                        const session = await globalThis.LanguageModel.create();
                        const reply = await session.prompt(promptText);
                        return { reply };
                    }
                    return { error: 'no-api' };
                } catch (e) {
                    return { error: e?.message || String(e) };
                }
            },
            args: [prompt]
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