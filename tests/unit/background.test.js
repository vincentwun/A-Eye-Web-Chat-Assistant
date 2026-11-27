import { test } from 'node:test';
import assert from 'node:assert/strict';

test('background initializes missing defaults, opens the side panel and routes shortcuts', async () => {
  // WXT imports the runtime module while inspecting the entrypoint at build time.
  // Importing it must not require browser globals or register any listeners.
  const { registerBackgroundListeners } = await import('../../src/background/backgroundRuntime.ts');
  const listeners = {};
  const sent = [];
  let saved;
  let panelBehavior;
  globalThis.chrome = {
    runtime: { onInstalled: { addListener: fn => { listeners.installed = fn; } }, onMessage: { addListener: fn => { listeners.message = fn; } }, sendMessage: async message => sent.push(message), getManifest: () => ({ version: 'test' }) },
    storage: { local: { get: async () => ({ apiSettings: { existing: true } }), set: async values => { saved = values; } } },
    sidePanel: { setPanelBehavior: options => { panelBehavior = options; } },
    commands: { onCommand: { addListener: fn => { listeners.command = fn; } } },
  };
  try {
    registerBackgroundListeners();
    assert.deepEqual(panelBehavior, { openPanelOnActionClick: true });
    await listeners.installed({ reason: 'install' });
    assert.equal(saved.apiSettings, undefined);
    assert.ok(saved.userPrompts);
    assert.ok(saved['aeye-voice-settings']);
    listeners.command('toggle-api-mode');
    listeners.command('toggle-voice-input');
    listeners.command('toggle-repeat');
    assert.deepEqual(sent, [{ type: 'toggleApiMode' }, { type: 'toggleVoiceInput' }, { type: 'toggleRepeat' }]);
    assert.equal(listeners.message({ type: 'unknown' }, {}, () => {}), false);
  } finally {
    delete globalThis.chrome;
  }
});
