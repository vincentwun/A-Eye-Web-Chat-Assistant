import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigValidator } from '../../src/components/configValidator.ts';
import { serviceConfigurations } from '../../src/option/apiRoute.ts';

function setup(state) {
  const messages = [];
  const speech = [];
  const validator = new ConfigValidator({
    stateManager: { getState: () => state },
    appendMessage: (...args) => messages.push(args),
    voiceController: { speakText: text => speech.push(text) },
  });
  return { validator, messages, speech };
}

for (const [kind, services] of Object.entries(serviceConfigurations)) {
  for (const [name, config] of Object.entries(services)) {
    test(`${kind} ${name} accepts all required fields`, () => {
      const state = Object.fromEntries(config.requiredFields.map(field => [field, 'configured']));
      if (kind === 'local') state.localApiMode = name;
      else if (name.startsWith('gemini-')) {
        state.cloudProvider = 'gemini';
        state.cloudApiMethod = name === 'gemini-proxy' ? 'proxy' : 'direct';
      } else state.cloudProvider = name;
      const { validator, messages, speech } = setup(state);
      assert.equal(kind === 'local' ? validator.isLocalModeConfigValid() : validator.isCloudModeConfigValid(), true);
      assert.deepEqual(messages, []);
      assert.deepEqual(speech, []);
    });

    if (config.requiredFields.length) test(`${kind} ${name} reports each missing field`, () => {
      const { validator, messages, speech } = setup({});
      assert.equal(validator._validateConfig(kind, name), false);
      assert.equal(messages.length, config.requiredFields.length);
      for (const [index, field] of config.requiredFields.entries()) {
        assert.match(messages[index][1], new RegExp(config.labels[field] || field));
      }
      assert.equal(speech.length, 1);
    });
  }
}

test('unknown provider reports a configuration error', () => {
  const { validator, messages, speech } = setup({ localApiMode: 'unknown' });
  assert.equal(validator.isLocalModeConfigValid(), false);
  assert.match(messages[0][1], /unknown/);
  assert.deepEqual(speech, ['Configuration error.']);
});
