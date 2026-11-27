import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendOllamaRequest } from '../../src/api/ollamaApi.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('posts model, messages and image to the local Ollama endpoint', async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ message: { content: 'answer' } }) };
  };
  const result = await sendOllamaRequest({ localMultimodalModel: 'test-model' }, [
    { role: 'user', content: 'describe', images: ['abc'] },
  ]);
  assert.equal(result, 'answer');
  assert.equal(request.url, 'http://localhost:11434/api/chat');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), {
    model: 'test-model', messages: [{ role: 'user', content: 'describe', images: ['abc'] }], stream: false,
  });
});

test('rejects a missing model before making a request', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; };
  await assert.rejects(sendOllamaRequest({}, []), /model name is not set/);
  assert.equal(called, false);
});

test('reports a provider HTTP error', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => '{"error":"model missing"}' });
  await assert.rejects(sendOllamaRequest({ localMultimodalModel: 'x' }, []), /404 Not Found.*model missing/);
});

for (const [body, expected] of [
  [{ response: 'legacy response' }, 'legacy response'],
  [{ error: 'bad model' }, 'Ollama API Error: bad model'],
  [{}, 'Error: Could not parse Ollama response.'],
]) {
  test(`handles Ollama response: ${expected}`, async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => body });
    assert.equal(await sendOllamaRequest({ localMultimodalModel: 'x' }, []), expected);
  });
}
