import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { STTController } from '../../src/voice/sttController.ts';
import { TTSController } from '../../src/voice/ttsController.ts';
import { VoiceController } from '../../src/voice/voiceControl.ts';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
afterEach(() => {
  delete globalThis.window; delete globalThis.document; delete globalThis.SpeechSynthesisUtterance; delete globalThis.chrome;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
});

test('STT initializes recognition and updates its language', () => {
  class Recognition { start() {} stop() {} }
  globalThis.window = { SpeechRecognition: Recognition };
  const stt = new STTController();
  stt.initialize({ sttLanguage: 'en-US' });
  const recognition = stt.recognition;
  assert.equal(recognition.lang, 'en-US');
  assert.equal(recognition.continuous, true);
  stt.initialize({ sttLanguage: 'zh-HK' });
  assert.equal(stt.recognition, recognition);
  assert.equal(recognition.lang, 'zh-HK');
  stt.cleanup();
  assert.equal(stt.recognition, null);
  assert.equal(recognition.onresult, null);
});

test('STT updates text, sends a final transcript after silence and restores focus', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const input = { value: '', placeholder: '', focused: false, focus() { this.focused = true; } };
  globalThis.document = { getElementById: () => input };
  const states = [];
  let sent = 0;
  let stopped = 0;
  const stt = new STTController();
  stt.recognition = { stop: () => stopped++ };
  stt.active = true;
  stt.setCallbacks({ handleSendMessage: () => sent++, updateVoiceInputButtonState: value => states.push(value) });
  const final = Object.assign([{ transcript: 'hello world' }], { isFinal: true });
  stt._onResult({ resultIndex: 0, results: [final] });
  assert.equal(input.value, 'hello world');
  t.mock.timers.tick(100);
  assert.equal(sent, 1);
  assert.equal(stopped, 1);
  stt._onEnd();
  assert.deepEqual(states, [false]);
  assert.equal(input.focused, true);
  assert.equal(stt.isVoiceInputActive(), false);
});

test('STT handles an unsupported recognition API', () => {
  globalThis.window = {};
  const stt = new STTController();
  stt.initialize({ sttLanguage: 'en-US' });
  stt.start();
  assert.equal(stt.recognition, null);
});

test('STT sends interim transcripts to the React callback without mutating the DOM', () => {
  const input = { value: 'untouched' };
  globalThis.document = { getElementById: () => input };
  const transcripts = [];
  const stt = new STTController();
  stt.setCallbacks({ updateTranscript: value => transcripts.push(value) });
  stt._onResult({ resultIndex: 0, results: [Object.assign([{ transcript: 'hello' }], { isFinal: false })] });
  assert.deepEqual(transcripts, ['hello']);
  assert.equal(input.value, 'untouched');
});

test('TTS selects a voice by name then speaks and completes', async () => {
  const voices = [{ name: 'English', lang: 'en-US' }, { name: 'Cantonese', lang: 'zh-HK' }];
  const utterances = [];
  globalThis.window = { speechSynthesis: { getVoices: () => voices, speak: utterance => { utterances.push(utterance); utterance.onstart(); utterance.onend(); } } };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const tts = new TTSController();
  await tts.initialize({ ttsVoiceName: 'Cantonese', ttsLanguage: 'en-US' });
  await tts.speakText('hello');
  assert.equal(utterances[0].voice, voices[1]);
  assert.equal(utterances[0].text, 'hello');
  assert.equal(tts.isSpeaking, false);
});

test('TTS falls back to a language variant and cancels active speech', async () => {
  const voice = { name: 'English UK', lang: 'en-GB' };
  let cancelled = 0;
  globalThis.window = { speechSynthesis: { getVoices: () => [voice], speaking: true, cancel: () => cancelled++ } };
  const tts = new TTSController();
  await tts.initialize({ ttsLanguage: 'en-AU' });
  assert.equal(tts.selectedVoice, voice);
  tts.stopSpeaking();
  assert.equal(cancelled, 1);
});

test('TTS reports a missing speech synthesis API', async () => {
  globalThis.window = {};
  const tts = new TTSController();
  await assert.rejects(tts.initialize({}), /TTS API unavailable/);
  await assert.rejects(tts.speakText('hello'), /TTS API unavailable/);
});

async function makeVoiceController() {
  globalThis.window = { speechSynthesis: { getVoices: () => [{ name: 'English', lang: 'en-US' }] } };
  globalThis.chrome = { storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } } };
  const voice = new VoiceController();
  await voice.initializationPromise;
  return voice;
}
test('voice controller sanitizes code and markdown before speaking a response', async () => {
  const voice = await makeVoiceController();
  const spoken = [];
  voice.tts.speakText = async text => spoken.push(text);
  await voice.speakResponse('Hello **world** `inline`\n```js\nalert(1)\n```');
  assert.deepEqual(spoken, ['Hello world inline']);
  voice.cleanup();
});
test('voice controller checks microphone permissions and starts or stops input', async () => {
  const voice = await makeVoiceController();
  let active = false;
  let starts = 0;
  let stops = 0;
  voice.stt = { isVoiceInputActive: () => active, start: () => { starts++; active = true; }, stop: () => { stops++; active = false; }, cleanup() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { permissions: { query: async () => ({ state: 'granted' }) } } });
  await voice.toggleVoiceInput();
  await voice.toggleVoiceInput();
  assert.equal(starts, 1);
  assert.equal(stops, 1);
  voice.cleanup();
});
test('voice controller refuses to start when microphone permission is denied', async () => {
  const voice = await makeVoiceController();
  let starts = 0;
  voice.stt = { isVoiceInputActive: () => false, start: () => starts++, cleanup() {} };
  voice.tts.speakText = async () => {};
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { permissions: { query: async () => ({ state: 'denied' }) } } });
  await voice.toggleVoiceInput();
  assert.equal(starts, 0);
  voice.cleanup();
});
