import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GetElementAction as Migrated } from '../../src/action/getElementAction.ts';

afterEach(() => { delete globalThis.chrome; });
for (const [name, Action] of [['TypeScript', Migrated]]) {
  test(`${name} element analysis escapes preview and preserves provider request`, async () => {
    const calls = {};
    globalThis.chrome = { runtime: { sendMessage: async message => {
      assert.deepEqual(message, { type: 'findElements' });
      return { success: true, elements: [{ selector: '<button>' }] };
    } } };
    let processing = false;
    const deps = {
      uiManager: { escapeHTML: text => `escaped:${text}`, appendPreviewMessage: async (...args) => { calls.preview = args; }, showThinkingIndicator() {} },
      voiceController: { speakText: async () => {} },
      apiService: { sendRequest: async (...args) => { calls.request = args; return 'answer'; } },
      stateManager: { getPrompts: () => ({ getElement_prompt: 'inspect', system_prompt: { web_assistant: 'system' } }), isProcessing: () => processing },
      getApiConfig: () => ({ mode: 'local' }), getHistoryToSend: () => ['history'],
      handleResponse: async response => { calls.response = response; }, handleError: (...args) => { calls.error = args; },
      setProcessing: value => { processing = value; }, appendMessage() {},
    };
    await new Action(deps).execute();
    assert.match(calls.preview[1], /^escaped:/);
    assert.equal(calls.request[2].prompt, 'inspect\n\n---\n\n' + JSON.stringify([{ selector: '<button>' }], null, 2));
    assert.deepEqual(calls.request.slice(3), [null, 'system']);
    assert.equal(calls.response, 'answer');
    assert.equal(processing, false);
    assert.equal(calls.error, undefined);
  });
}
