import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendLmstudioRequest } from '../../src/api/lmstudioApi.ts';
import { sendVllmRequest } from '../../src/api/vllmApi.ts';
import { sendGeminiRequest } from '../../src/api/geminiApi.ts';
import { sendMistralRequest } from '../../src/api/mistralApi.ts';
import { sendAzureFoundryRequest } from '../../src/api/azureFoundryApi.ts';
import { sendGeminiNanoRequest } from '../../src/api/geminiNanoApi.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.chrome;
  delete globalThis.ai;
  delete globalThis.LanguageModel;
});

function fetchReply(body, options = {}) {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, ...init, body: JSON.parse(init.body) });
    const status = options.status ?? (options.ok === false ? 500 : 200);
    const response = new Response(JSON.stringify(body), { status, statusText: options.statusText });
    if (options.text) response.text = options.text;
    return response;
  };
  return requests;
}

for (const provider of [
  { name: 'LM Studio', send: sendLmstudioRequest, config: { lmstudioModelName: 'model' }, url: 'http://localhost:1234/v1/chat/completions' },
  { name: 'vLLM', send: sendVllmRequest, config: { localApiUrl: 'http://localhost:8000', vllmModelName: 'model' }, url: 'http://localhost:8000/v1/chat/completions' },
]) {
  test(`${provider.name} formats messages and returns the completion`, async () => {
    const requests = fetchReply({ choices: [{ message: { content: 'answer' } }] });
    assert.equal(await provider.send(provider.config, [{ role: 'user', content: 'hello', images: ['abc'] }]), 'answer');
    assert.equal(requests[0].url, provider.url);
    assert.equal(requests[0].body.model, 'model');
    assert.deepEqual(requests[0].body.messages[0].content, [
      { type: 'text', text: 'hello' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
    ]);
  });
  test(`${provider.name} rejects missing configuration and an empty request`, async () => {
    await assert.rejects(provider.send({}, []), /not set/);
    await assert.rejects(provider.send(provider.config, []), /empty request/);
  });
  test(`${provider.name} handles malformed and failed responses`, async () => {
    fetchReply({});
    assert.match(await provider.send(provider.config, [{ role: 'user', content: 'x' }]), /Could not parse/);
    fetchReply({}, { ok: false, status: 429, statusText: 'Rate Limited', text: async () => '{"error":{"message":"retry"}}' });
    await assert.rejects(provider.send(provider.config, [{ role: 'user', content: 'x' }]), /429.*retry/);
  });
  test(`${provider.name} preserves its handling of empty completion content`, async () => {
    fetchReply({ choices: [{ message: { content: '' } }] });
    const result = await provider.send(provider.config, [{ role: 'user', content: 'x' }]);
    assert.equal(result, provider.name === 'LM Studio' ? '' : 'Error: Could not parse vLLM response.');
  });
}

const geminiMessages = [
  { role: 'system', content: 'instructions' },
  { role: 'user', content: 'describe', images: ['abc'] },
];
const geminiResult = { candidates: [{ content: { parts: [{ text: 'hello' }, { text: ' world' }] } }] };
for (const method of ['direct', 'proxy']) {
  test(`Gemini ${method} sends expected auth, model, text and image`, async () => {
    const requests = fetchReply(geminiResult);
    const config = { cloudApiMethod: method, cloudModelName: 'gemini-2.5-flash', cloudApiKey: 'fake', cloudProxyUrl: 'https://proxy.invalid', gcpApiKey: 'proxy-key' };
    assert.equal(await sendGeminiRequest(config, geminiMessages, 'image/webp'), 'hello world');
    const request = requests[0];
    if (method === 'direct') {
      assert.match(request.url, /\/v1beta\/models\/gemini-2\.5-flash:generateContent/);
      assert.equal(request.headers.get('x-goog-api-key'), 'fake');
      assert.deepEqual(request.body.contents[0].parts[1], { inlineData: { mimeType: 'image/webp', data: 'abc' } });
      assert.deepEqual(request.body.tools, [{ urlContext: {} }, { googleSearch: {} }]);
      assert.equal(request.body.generationConfig.thinkingConfig.thinkingBudget, -1);
    }
    else {
      assert.equal(request.url, config.cloudProxyUrl);
      assert.equal(request.headers['x-api-key'], 'proxy-key');
      assert.equal(request.headers['X-Model-Name'], config.cloudModelName);
      assert.deepEqual(request.body.contents[0].parts[1], { inline_data: { mime_type: 'image/webp', data: 'abc' } });
      assert.equal(request.body.generationConfig.thinkingConfig.thinkingBudget, -1);
    }
    if (method === 'proxy') assert.deepEqual(request.body.systemInstruction, { parts: [{ text: 'instructions' }] });
    else assert.deepEqual(request.body.systemInstruction, { parts: [{ text: 'instructions' }] });
  });
}
test('Gemini validates configuration and reports blocked responses and HTTP errors', async () => {
  await assert.rejects(sendGeminiRequest({}, geminiMessages), /model name/);
  await assert.rejects(sendGeminiRequest({ cloudModelName: 'x' }, geminiMessages), /API Key/);
  fetchReply({ promptFeedback: { blockReason: 'SAFETY' } });
  assert.match(await sendGeminiRequest({ cloudModelName: 'x', cloudApiKey: 'fake' }, geminiMessages), /blocked.*SAFETY/);
  fetchReply({ error: { message: 'quota' } }, { ok: false, status: 429, statusText: 'Too Many Requests' });
  await assert.rejects(sendGeminiRequest({ cloudModelName: 'x', cloudApiKey: 'fake' }, geminiMessages), /429.*quota/);
});

for (const method of ['direct', 'proxy']) {
  for (const model of ['gemma-4-26b-a4b-it', 'gemma-4-31b-it']) {
    test(`${model} ${method} omits unsupported tools`, async () => {
      const requests = fetchReply(geminiResult);
      const config = { cloudApiMethod: method, cloudModelName: model, cloudApiKey: 'fake', cloudProxyUrl: 'https://proxy.invalid', gcpApiKey: 'proxy-key' };
      assert.equal(await sendGeminiRequest(config, geminiMessages, 'image/webp'), 'hello world');
      assert.equal(requests[0].body.tools, undefined);
      const parts = requests[0].body.contents[0].parts;
      assert.ok(parts.some(part => part.inlineData || part.inline_data));
    });
  }
}

test('Mistral uses conversations for text and includes references', async () => {
  const requests = fetchReply({ outputs: [{ type: 'message.output', content: [{ type: 'text', text: 'answer' }, { type: 'tool_reference', title: 'Site', url: 'https://example.invalid' }] }] });
  const answer = await sendMistralRequest({ mistralApiKey: 'fake', mistralModelName: 'model' }, [{ role: 'system', content: 'system' }, { role: 'user', content: 'question' }]);
  assert.equal(requests[0].url, 'https://api.mistral.ai/v1/conversations');
  assert.equal(requests[0].headers.Authorization, 'Bearer fake');
  assert.equal(requests[0].body.instructions, 'system');
  assert.match(answer, /answer[\s\S]*\[Site\]\(https:\/\/example\.invalid\)/);
});
test('Mistral uses chat completions for images', async () => {
  const requests = fetchReply({ choices: [{ message: { content: 'answer' } }] });
  assert.equal(await sendMistralRequest({ mistralApiKey: 'fake', mistralModelName: 'model' }, [{ role: 'user', content: 'describe', images: ['abc'] }], 'image/png'), 'answer');
  assert.match(requests[0].url, /chat\/completions$/);
  assert.deepEqual(requests[0].headers, { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer fake' });
  assert.deepEqual(requests[0].body.messages[0].content[1], { type: 'image_url', image_url: 'data:image/png;base64,abc' });
});
test('Mistral preserves endpoint-specific errors and status fallback', async () => {
  const config = { mistralApiKey: 'fake', mistralModelName: 'model' };
  fetchReply({ error: { message: 'quota exceeded' } }, { status: 429 });
  await assert.rejects(sendMistralRequest(config, [{ role: 'user', content: 'question' }]), { message: 'Mistral Conversations API: quota exceeded' });
  fetchReply({}, { status: 503 });
  await assert.rejects(sendMistralRequest(config, [{ role: 'user', images: ['abc'] }], 'image/png'), { message: 'Mistral Chat API: API Error (503)' });
});
test('Mistral validates configuration and handles API errors', async () => {
  await assert.rejects(sendMistralRequest({}, []), /API Key/);
  await assert.rejects(sendMistralRequest({ mistralApiKey: 'fake' }, []), /model name/);
  fetchReply({ message: 'denied' }, { ok: false, status: 401 });
  await assert.rejects(sendMistralRequest({ mistralApiKey: 'fake', mistralModelName: 'x' }, [{ role: 'user', content: 'x' }]), /denied/);
});

test('Azure Foundry sends APIM auth and structured input', async () => {
  const requests = fetchReply({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'answer' }] }] });
  const config = { apimEndpoint: 'https://example.invalid/api/', apimSubscriptionKey: 'fake', azureFoundryModelName: 'model' };
  assert.equal(await sendAzureFoundryRequest(config, [{ role: 'user', content: 'describe', images: ['abc'] }], 'image/webp'), 'answer');
  assert.equal(requests[0].url, 'https://example.invalid/api/responses?api-version=2025-03-01-preview');
  assert.equal(requests[0].headers['api-key'], 'fake');
  assert.deepEqual(requests[0].body.input[0].content[1], { type: 'input_image', image_url: 'data:image/webp;base64,abc' });
});
test('Azure Foundry handles missing configuration, empty output and HTTP error', async () => {
  await assert.rejects(sendAzureFoundryRequest({}, []), /not configured/);
  const config = { apimEndpoint: 'https://example.invalid', apimSubscriptionKey: 'fake', azureFoundryModelName: 'm' };
  fetchReply({});
  assert.equal(await sendAzureFoundryRequest(config, []), 'No response content received.');
  fetchReply({}, { ok: false, status: 401, text: async () => 'denied' });
  await assert.rejects(sendAzureFoundryRequest(config, []), /401.*denied/);
});

test('Gemini Nano uses an available direct session and destroys it', async () => {
  let destroyed = false;
  let received;
  globalThis.LanguageModel = { create: async () => ({ prompt: async payload => { received = payload; return 'answer'; }, destroy: () => { destroyed = true; } }) };
  assert.equal(await sendGeminiNanoRequest({}, [{ role: 'user', content: 'hello' }]), 'answer');
  assert.deepEqual(received, [{ role: 'user', content: [{ type: 'text', value: 'hello' }] }]);
  assert.equal(destroyed, true);
});
test('Gemini Nano falls back to active page and maps unavailable responses', async () => {
  globalThis.chrome = { tabs: { query: async () => [{ id: 12, url: 'https://example.invalid' }] }, scripting: { executeScript: async () => [{ result: { error: 'unavailable:after-download' } }] } };
  await assert.rejects(sendGeminiNanoRequest({}, [{ role: 'user', content: 'hello' }]), /downloading/);
  chrome.tabs.query = async () => [{ id: 12, url: 'chrome://settings' }];
  await assert.rejects(sendGeminiNanoRequest({}, [{ role: 'user', content: 'hello' }]), /No suitable page/);
});
