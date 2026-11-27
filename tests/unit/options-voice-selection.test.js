import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectVoice } from '../../src/option/voiceSelection.ts';

const voices = [
  { name: 'Cantonese', lang: 'zh-HK', default: true },
  { name: 'English', lang: 'en-US', default: false },
  { name: 'English default', lang: 'en-US', default: true },
];

test('voice selection prefers the saved name, then the previous name', () => {
  assert.deepEqual(selectVoice(voices, 'Cantonese', 'English'), { name: 'Cantonese', persist: false });
  assert.deepEqual(selectVoice(voices, 'missing', 'English'), { name: 'English', persist: false });
});

test('voice selection chooses and persists an English fallback only without a saved name', () => {
  assert.deepEqual(selectVoice(voices, '', ''), { name: 'English default', persist: true });
  assert.deepEqual(selectVoice(voices, 'missing', ''), { name: 'English default', persist: false });
  assert.deepEqual(selectVoice(voices.slice(0, 2), null, ''), { name: 'English', persist: true });
  assert.deepEqual(selectVoice(voices.slice(0, 1), '', ''), { name: '', persist: false });
  assert.deepEqual(selectVoice([], '', ''), { name: '', persist: false });
});
