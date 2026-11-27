import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiService } from '../../src/api/apiService.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('normalizes history, merges adjacent messages and preserves the system prompt', () => {
  const service = new ApiService();
  const result = service._prepareStandardMessages([
    { role: 'system', content: 'ignored' },
    { role: 'user', content: 'first' },
    { role: 'user', content: 'second' },
    { role: 'assistant', content: 'answer' },
  ], { prompt: 'next' }, 'image', 'instructions', 10);
  assert.deepEqual(result, [
    { role: 'system', content: 'instructions' },
    { role: 'user', content: 'first\nsecond', images: null },
    { role: 'assistant', content: 'answer', images: null },
    { role: 'user', content: 'next', images: ['image'] },
  ]);
});

test('keeps only the most recent history before adding the new message', () => {
  const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }));
  const result = new ApiService()._prepareStandardMessages(history, { prompt: 'next' }, null, null, 10);
  assert.equal(result[0].content, '2');
  assert.equal(result.at(-1).content, 'next');
  assert.equal(result.length, 11);
});

test('removes reasoning up to the final closing think tag', () => {
  const service = new ApiService();
  assert.equal(service._processResponseContent('<think>one</think><think>two</think> answer '), 'answer');
  assert.equal(service._processResponseContent('plain response'), 'plain response');
  assert.deepEqual(service._processResponseContent({ value: 1 }), { value: 1 });
});

test('rejects empty requests and invalid modes', async () => {
  const service = new ApiService();
  await assert.rejects(service.sendRequest({}, [], {}), /empty request/);
  await assert.rejects(service.sendRequest({ activeApiMode: 'invalid' }, [], { prompt: 'hello' }), /Invalid API mode/);
  await assert.rejects(service.sendRequest({ activeApiMode: 'local', localApiMode: 'invalid' }, [], { prompt: 'hello' }), /Unsupported local API mode/);
});

test('dispatches an image request to Ollama and strips reasoning from the response', async () => {
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: { content: '<think>reason</think>result' } }) };
  };
  const answer = await new ApiService().sendRequest(
    { activeApiMode: 'local', localApiMode: 'ollama', localMultimodalModel: 'model' },
    [], { prompt: 'describe' }, 'data:image/png;base64,YWJj', 'system',
  );
  assert.equal(answer, 'result');
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'describe', images: ['YWJj'] },
  ]);
});
