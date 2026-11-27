import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanelViewModel } from '../../entrypoints/sidepanel/panel-view-model.ts';

for (const useReactModel of [true]) test(`side panel sends chat, repeats and clears history (${useReactModel ? 'React model' : 'legacy UI'})`, async () => {
  const elements = new Map();
  const createNode = () => ({ value: '', style: { display: 'none' }, classList: { add() {}, toggle() {}, contains: () => false }, addEventListener() {}, appendChild() {}, querySelectorAll: () => [], focus() {} });
  globalThis.document = { readyState: 'complete', documentElement: { style: {} }, getElementById: id => { if (!elements.has(id)) elements.set(id, createNode()); return elements.get(id); }, createElement: () => createNode() };
  globalThis.window = { speechSynthesis: { getVoices: () => [{ name: 'English', lang: 'en-US' }], speak: utterance => { utterance.onstart(); utterance.onend(); } } };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
    runtime: { onMessage: { addListener() {} } },
  };
  try {
    const { initializeApp } = await import('../../src/main/sidepanel.ts');
    initializeApp(voice => new PanelViewModel(voice));
    await new Promise(resolve => setImmediate(resolve));
    const app = window.aiScreenReader;
    assert.equal(app.stateManager.isSettingsLoaded(), true);
    let request;
    let repeated;
    app.apiService.sendRequest = async (...args) => { request = args; return 'assistant reply'; };
    app.voiceController.speakResponse = async value => { repeated = value; };
    app.voiceController.playSendSound = () => {};
    app.voiceController.startThinkingSoundLoop = () => {};
    app.voiceController.stopThinkingSoundLoop = () => {};
    app.voiceController.stopSpeaking = () => {};
    app.voiceController.speakText = async () => {};
    app.uiManager.appendUserMessageWithImage = async () => {};
    app.uiManager.showThinkingIndicator = () => {};
    app.uiManager.hideThinkingIndicator = () => {};
    app.uiManager.appendMessage = () => {};
    app.appendMessage = (role, content) => app.stateManager.addMessage({ role, content });
    app.uiManager.setInput('Hello');
    await app.handleSendMessage();
    assert.equal(request[2].prompt, 'Hello');
    assert.deepEqual(app.stateManager.getState().messages.map(item => item.content), ['Hello', 'assistant reply']);
    assert.equal(app.stateManager.isProcessing(), false);
    await app.handleRepeat();
    assert.equal(repeated, 'assistant reply');
    app.handleClear();
    assert.deepEqual(app.stateManager.getState().messages, []);
    app.voiceController.cleanup();
  } finally {
    delete globalThis.document; delete globalThis.window; delete globalThis.chrome;
    delete globalThis.SpeechSynthesisUtterance;
  }
});
