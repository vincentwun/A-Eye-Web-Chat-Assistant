import { test } from 'node:test';
import assert from 'node:assert/strict';

test('permission content injects a microphone iframe and replaces a stale one', async () => {
  let listener;
  let removed = false;
  let inserted;
  globalThis.document = {
    getElementById: () => ({ remove: () => { removed = true; } }),
    createElement: () => ({ style: {} }), body: { appendChild: iframe => { inserted = iframe; } },
  };
  globalThis.chrome = { runtime: { onMessage: { addListener: fn => { listener = fn; } }, getURL: path => `extension://${path}` } };
  try {
  const { registerPermissionListener } = await import('../../src/permission/permissionContent.ts');
    registerPermissionListener();
    let response;
    assert.equal(listener({ action: 'requestMicPermission' }, {}, value => { response = value; }), true);
    assert.equal(removed, true);
    assert.equal(inserted.allow, 'microphone');
    assert.equal(inserted.src, 'extension://permission/permission.html');
    assert.deepEqual(response, { status: 'iframe injected' });
  } finally { delete globalThis.chrome; delete globalThis.document; }
});

for (const granted of [true, false]) {
  test(`microphone permission iframe reports ${granted ? 'grant' : 'denial'} and removes itself`, async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    let stopped = false;
    let removed = false;
    const messages = [];
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => {
      if (!granted) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      return { getTracks: () => [{ stop: () => { stopped = true; } }] };
    } } } });
    globalThis.window = { frameElement: { remove: () => { removed = true; } } };
    globalThis.chrome = { runtime: { sendMessage: message => messages.push(message) } };
    try {
      const { requestMicrophoneAccess } = await import('../../src/permission/requestPermission.ts');
      await requestMicrophoneAccess();
      assert.equal(messages[0].status, granted ? 'granted' : 'denied');
      assert.equal(removed, true);
      assert.equal(stopped, granted);
    } finally {
      if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
      delete globalThis.chrome; delete globalThis.window;
    }
  });
}
