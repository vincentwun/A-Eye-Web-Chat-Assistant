import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudVisibility, localVisibility } from '../../src/option/serviceVisibility.ts';

test('cloud service shows only its configuration fields', () => {
  assert.deepEqual(cloudVisibility('gemini'), { gateway: false, geminiKey: true, geminiModel: true, mistral: false, azure: false });
  assert.deepEqual(cloudVisibility('gateway'), { gateway: true, geminiKey: false, geminiModel: true, mistral: false, azure: false });
  assert.deepEqual(cloudVisibility('mistral'), { gateway: false, geminiKey: false, geminiModel: false, mistral: true, azure: false });
  assert.deepEqual(cloudVisibility('azure-foundry'), { gateway: false, geminiKey: false, geminiModel: false, mistral: false, azure: true });
});

test('local service shows its model and URL fields', () => {
  assert.deepEqual(localVisibility('ollama'), { ollama: true, lmstudio: false, vllm: false });
  assert.deepEqual(localVisibility('lmstudio'), { ollama: false, lmstudio: true, vllm: false });
  assert.deepEqual(localVisibility('vllm'), { ollama: false, lmstudio: false, vllm: true });
  assert.deepEqual(localVisibility('gemini-nano'), { ollama: false, lmstudio: false, vllm: false });
});
