import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../gcp/function_source/index.js', import.meta.url), 'utf8');
function setup(chunks = [], failure) {
  let handler;
  let modelOptions;
  let requestContents;
  const context = {
    console: { log() {}, warn() {}, error() {} }, process: { env: { K_SERVICE: 'test' } },
    require(name) {
      if (name === '@google-cloud/functions-framework') return { http: (_name, fn) => { handler = fn; } };
      if (name === '@google-cloud/vertexai') return {
        VertexAI: class { getGenerativeModel(options) { modelOptions = options; return { generateContentStream: async request => {
          requestContents = request;
          if (failure) throw failure;
          return { stream: (async function* () { yield* chunks; })() };
        } }; } },
        HarmCategory: {}, HarmBlockThreshold: {},
      };
      if (name === 'http') return { request: (_options, cb) => ({ on() {}, end() {
        const callbacks = {};
        cb({ statusCode: 200, on: (event, fn) => { callbacks[event] = fn; } });
        callbacks.data('fake-project'); callbacks.end();
      } }) };
      throw new Error(`unexpected require ${name}`);
    },
  };
  vm.runInNewContext(source, context);
  const response = { headers: {}, set(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, send(value) { this.body = value; return this; } };
  return { handler, response, getModelOptions: () => modelOptions, getRequest: () => requestContents };
}

test('GCP proxy handles CORS and rejects invalid requests', async () => {
  for (const [req, status] of [
    [{ method: 'OPTIONS' }, 204], [{ method: 'GET' }, 405],
    [{ method: 'POST', headers: {}, body: {} }, 400],
    [{ method: 'POST', headers: { 'x-model-name': 'model' }, body: {} }, 400],
  ]) {
    const { handler, response } = setup();
    await handler(req, response);
    assert.equal(response.statusCode, status);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
  }
});

test('GCP proxy forwards model options and aggregates streamed text', async () => {
  const chunk = text => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
  const service = setup([chunk('hello '), chunk('world')]);
  await service.handler({ method: 'POST', headers: { 'x-model-name': 'model' }, body: { contents: [{ role: 'user', parts: [{ text: 'question' }] }], systemInstruction: { parts: [{ text: 'system' }] } } }, service.response);
  assert.equal(service.response.statusCode, 200);
  assert.equal(service.response.body.candidates[0].content.parts[0].text, 'hello world');
  assert.equal(service.getModelOptions().model, 'model');
  assert.equal(service.getRequest().contents[0].parts[0].text, 'question');
});

test('GCP proxy returns a blocked result and maps upstream quota errors', async () => {
  const request = { method: 'POST', headers: { 'x-model-name': 'model' }, body: { contents: [] } };
  const blocked = setup([{ promptFeedback: { blockReason: 'SAFETY' } }]);
  await blocked.handler(request, blocked.response);
  assert.equal(blocked.response.statusCode, 400);
  assert.match(blocked.response.body.error, /SAFETY/);
  const quota = setup([], Object.assign(new Error('quota'), { code: 8 }));
  await quota.handler(request, quota.response);
  assert.equal(quota.response.statusCode, 429);
  assert.match(quota.response.body.error, /Quota exceeded/);
});
