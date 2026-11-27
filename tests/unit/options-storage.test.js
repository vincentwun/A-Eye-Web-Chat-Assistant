import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOptionsWriter, initialOptions, readOptions } from '../../src/option/optionsStorage.ts';

test('partial and null settings use defaults without losing unrelated values', () => {
  const initial = initialOptions({ settings: { localApiMode: null, cloudApiKey: '', extra: 1 }, prompts: { responseLanguage: '' }, voice: {} });
  assert.equal(initial.settings.localApiMode, 'ollama');
  assert.equal(initial.settings.cloudApiKey, '');
  assert.equal(initial.settings.extra, 1);
  assert.equal(initial.prompts.responseLanguage, 'en-US');
});

test('options writer retains unrelated settings and maps services', async () => {
  const data = { apiSettings: { cloudApiMethod: 'proxy', unrelated: 1 }, userPrompts: { custom: 'keep' }, 'aeye-voice-settings': { ttsLanguage: 'zh-HK' } };
  const storage = { async get() { return structuredClone(data); }, async set(value) { Object.assign(data, structuredClone(value)); } };
  const save = createOptionsWriter(storage);
  await save({ settings: { uiScale: 120 }, prompts: { responseLanguage: 'en-US' }, voice: { sttLanguage: 'zh-HK' }, localService: 'vllm', cloudService: 'mistral' });
  assert.deepEqual(data.apiSettings, { cloudApiMethod: 'proxy', unrelated: 1, uiScale: 120, localApiMode: 'vllm', cloudProvider: 'mistral' });
  assert.equal(data.userPrompts.custom, 'keep');
  assert.equal(data['aeye-voice-settings'].ttsLanguage, 'zh-HK');
});

test('options writer serializes concurrent saves and recovers after errors', async () => {
  const data = {};
  let fail = true;
  const storage = { async get() { return structuredClone(data); }, async set(value) { if (fail) { fail = false; throw new Error('failed'); } Object.assign(data, structuredClone(value)); } };
  const save = createOptionsWriter(storage);
  const update = (settings) => ({ settings, prompts: {}, voice: {}, localService: 'ollama', cloudService: 'gateway' });
  await assert.rejects(save(update({ first: 0 })), /failed/);
  await Promise.all([save(update({ first: 1 })), save(update({ second: 2 }))]);
  assert.equal(data.apiSettings.first, 1);
  assert.equal(data.apiSettings.second, 2);
  assert.equal(data.apiSettings.cloudApiMethod, 'proxy');
  assert.deepEqual((await readOptions(storage)).settings, data.apiSettings);
});

test('a default voice is saved only when no voice is selected', async () => {
  const data = { 'aeye-voice-settings': { sttLanguage: 'en-US', ttsVoiceName: '' } };
  const storage = { async get() { return structuredClone(data); }, async set(value) { Object.assign(data, structuredClone(value)); } };
  const save = createOptionsWriter(storage);
  await save.setDefaultVoice('English');
  await save.setDefaultVoice('Other');
  assert.deepEqual(data['aeye-voice-settings'], { sttLanguage: 'en-US', ttsVoiceName: 'English' });
});
