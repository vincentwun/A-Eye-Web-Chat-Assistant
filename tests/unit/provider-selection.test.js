import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudSelectionFromSettings, cloudSettingsFromSelection } from '../../src/option/providerSelection.ts';

test('cloud service choices preserve the existing storage mapping', () => {
  for (const [choice, settings] of [
    ['gemini', { cloudProvider: 'gemini', cloudApiMethod: 'direct' }],
    ['gateway', { cloudProvider: 'gemini', cloudApiMethod: 'proxy' }],
    ['azure-foundry', { cloudProvider: 'azure-foundry', cloudApiMethod: 'direct' }],
    ['mistral', { cloudProvider: 'mistral' }],
  ]) {
    assert.deepEqual(cloudSettingsFromSelection(choice), settings);
    assert.equal(cloudSelectionFromSettings(settings.cloudProvider, settings.cloudApiMethod ?? 'proxy'), choice);
  }
  assert.deepEqual(cloudSettingsFromSelection(null), { cloudProvider: 'gemini', cloudApiMethod: 'direct' });
  assert.equal(cloudSelectionFromSettings('unknown', 'proxy'), 'gateway');
  assert.equal(cloudSelectionFromSettings('unknown', 'unknown'), 'gemini');
});
