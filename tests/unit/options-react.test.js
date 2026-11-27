import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { build } from 'vite';
import { writeFile, unlink } from 'node:fs/promises';

test('React options loads and saves existing settings, including custom models', async () => {
  const { window } = parseHTML('<html><body><div id="options-root"></div></body></html>');
  const originals = new Map();
  const expose = (name, value) => { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); };
  const stored = {
    apiSettings: { localApiMode: 'vllm', localMultimodalModel: 'custom-model', cloudProvider: 'gemini', cloudApiMethod: 'direct', cloudApiKey: 'secret', cloudModelName: 'existing-model-id', uiScale: 120 },
    userPrompts: { responseLanguage: 'en-US', custom: 'keep' },
    'aeye-voice-settings': { sttLanguage: 'en-US', ttsVoiceName: 'English', ttsLanguage: 'en-US' },
  };
  const synth = new window.EventTarget();
  synth.getVoices = () => [{ name: 'English', lang: 'en-US', default: true }];
  window.speechSynthesis = synth;
  window.location = { protocol: 'chrome-extension:' };
  for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Node', 'Event', 'EventTarget']) expose(name, name === 'window' ? window : window[name]);
  expose('navigator', window.navigator);
  expose('chrome', { runtime: {}, storage: { local: {
    async get() { return structuredClone(stored); },
    async set(values) { Object.assign(stored, structuredClone(values)); },
  } } });
  const output = await build({ configFile: false, logLevel: 'silent', build: { ssr: 'src/option/optionsApp.tsx', write: false } });
  const bundle = new URL(`./.options-react-${process.pid}.mjs`, import.meta.url);
  await writeFile(bundle, output.output[0].code);
  let mounted;
  try {
    mounted = await import(bundle.href);
    await new Promise(resolve => setTimeout(resolve, 30));
    const root = document.getElementById('options-root');
    assert.equal(document.getElementById('cloud-api-key-input').value, 'secret');
    const geminiModel = document.getElementById('cloud-model-name-input');
    assert.equal(geminiModel.value, 'existing-model-id');
    assert.ok([...geminiModel.options].some(option => option.value === 'gemini-2.5-flash'));
    for (const model of ['gemma-4-26b-a4b-it', 'gemma-4-31b-it']) {
      assert.ok([...geminiModel.options].some(option => option.value === model));
    }
    assert.equal(document.getElementById('custom-ollama-model-input').value, 'custom-model');
    assert.equal(document.getElementById('ui-scale-value').textContent, '120%');
    assert.ok(root.querySelector('#vllm-url-container:not(.hidden)'));
    {
      const endpoint = document.getElementById('vllm-url-input');
      endpoint.value = 'http://127.0.0.1:9000';
      endpoint.dispatchEvent(new window.Event('focusout', { bubbles: true }));
    }
    document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(stored.apiSettings.cloudApiKey, 'secret');
    assert.equal(stored.apiSettings.cloudModelName, 'existing-model-id');
    assert.equal(stored.apiSettings.localApiMode, 'vllm');
    assert.equal(stored.apiSettings.localMultimodalModel, 'custom-model');
    assert.equal(stored.apiSettings.localApiUrl, 'http://127.0.0.1:9000');
    assert.equal(stored.userPrompts.custom, 'keep');
    [...geminiModel.options].find(option => option.value === 'gemini-2.5-flash').selected = true;
    document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(stored.apiSettings.cloudModelName, 'gemini-2.5-flash');
    const mistral = document.getElementById('cloud-select-mistral');
    mistral.checked = true;
    mistral.dispatchEvent(new window.Event('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(stored.apiSettings.cloudProvider, 'mistral');
    assert.equal(document.getElementById('mistral-api-key-container').classList.contains('hidden'), false);
  } finally {
    mounted?.mountedOptions?.unmount();
    await unlink(bundle);
    for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
  }
});
