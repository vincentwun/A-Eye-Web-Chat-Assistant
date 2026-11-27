import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { playStartSound, playSendSound, playThinkingSound } from '../../src/voice/soundEffects.ts';

afterEach(() => { delete globalThis.window; });
for (const [name, play, frequency, duration] of [
  ['start', playStartSound, 660, 0.2], ['send', playSendSound, 500, 0.1], ['thinking', playThinkingSound, 440, 0.15],
]) {
  test(`${name} sound schedules its tone`, () => {
    const calls = {};
    const oscillator = { connect() {}, frequency: { setValueAtTime: value => { calls.frequency = value; } }, start: time => { calls.start = time; }, stop: time => { calls.stop = time; } };
    globalThis.window = { AudioContext: class { currentTime = 0; destination = {}; createOscillator() { return oscillator; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; } } };
    play();
    assert.deepEqual(calls, { frequency, start: 0, stop: duration });
    assert.equal(oscillator.type, 'sine');
  });
}
test('sound effects tolerate an unavailable audio context', () => {
  globalThis.window = {};
  assert.doesNotThrow(playStartSound);
  assert.doesNotThrow(playSendSound);
  assert.doesNotThrow(playThinkingSound);
});
