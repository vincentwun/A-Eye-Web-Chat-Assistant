import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { StateManager } from '../../src/components/stateManager.ts';

afterEach(() => { delete globalThis.chrome; });

function mockStorage(initial = {}) {
  const data = structuredClone(initial);
  let listener;
  globalThis.chrome = { storage: {
    local: {
      async get(keys) { return Object.fromEntries([keys].flat().filter(k => k in data).map(k => [k, structuredClone(data[k])])); },
      async set(values) { Object.assign(data, structuredClone(values)); },
    },
    onChanged: { addListener(fn) { listener = fn; } },
  } };
  return { data, change: (...args) => listener(...args) };
}

test('loads saved settings and prompts with defaults for missing fields', async () => {
  mockStorage({ apiSettings: { activeApiMode: 'local' }, userPrompts: { custom: 'hello' } });
  const manager = new StateManager();
  await manager.initialize();
  assert.equal(manager.getState().activeApiMode, 'local');
  assert.equal(manager.getState().localApiMode, 'ollama');
  assert.equal(manager.getPrompts().custom, 'hello');
  assert.equal(manager.isSettingsLoaded(), true);
});

test('persists mode changes without discarding other settings', async () => {
  const storage = mockStorage({ apiSettings: { activeApiMode: 'cloud', cloudModelName: 'custom' } });
  const manager = new StateManager();
  await manager.initialize();
  await manager.setActiveApiMode('local');
  assert.deepEqual(storage.data.apiSettings, { activeApiMode: 'local', cloudModelName: 'custom' });
});

test('updates settings and prompts from local storage changes only', async () => {
  const storage = mockStorage();
  const updates = [];
  const manager = new StateManager(change => updates.push(change));
  await manager.initialize();
  storage.change({ apiSettings: { newValue: { activeApiMode: 'local' } } }, 'sync');
  assert.equal(updates.length, 0);
  storage.change({ apiSettings: { newValue: { activeApiMode: 'local' } }, userPrompts: { newValue: { custom: 'x' } } }, 'local');
  assert.equal(manager.getState().activeApiMode, 'local');
  assert.equal(manager.getPrompts().custom, 'x');
  assert.deepEqual(updates, [{ settingsChanged: true, promptsChanged: true }]);
});

test('limits stored messages to 20 and API history to 10, excluding commands', () => {
  const manager = new StateManager();
  for (let i = 0; i < 23; i++) manager.addMessage({ role: 'user', content: String(i) });
  manager.addMessage({ role: 'system', content: 'hidden' });
  assert.equal(manager.getState().messages.length, 20);
  assert.deepEqual(manager.getHistoryToSend('22').map(m => m.content), ['12','13','14','15','16','17','18','19','20','21']);
  manager.clearMessages();
  assert.deepEqual(manager.getState().messages, []);
});

test('tracks and clears the last image', () => {
  const manager = new StateManager();
  manager.updateLastImageData('data:image/png;base64,eA==', 'image/png');
  assert.deepEqual(manager.getState().lastImageData, { dataUrl: 'data:image/png;base64,eA==', mimeType: 'image/png' });
  manager.clearLastImageData();
  assert.deepEqual(manager.getState().lastImageData, { dataUrl: null, mimeType: null });
});
