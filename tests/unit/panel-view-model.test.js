import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanelViewModel } from '../../entrypoints/sidepanel/panel-view-model.ts';

test('panel state tracks input, mode, images and processing independently', () => {
  const model = new PanelViewModel({ startThinkingSoundLoop() {}, stopThinkingSoundLoop() {} });
  let updates = 0;
  const unsubscribe = model.subscribe(() => updates++);
  model.setInput('  hello  ');
  assert.equal(model.getUserInput(), 'hello');
  model.updateModeUI('cloud');
  model.showPastedImagePreview('data:image/png;base64,x');
  assert.equal(model.isPastedImageVisible(), true);
  model.updateVoiceButtonState(true);
  model.setProcessingState(true);
  assert.equal(model.getSnapshot().recording, false);
  assert.equal(model.getSnapshot().processing, true);
  assert.equal(model.getSnapshot().mode, 'cloud');
  model.hidePastedImagePreview();
  model.clearUserInput();
  assert.equal(model.isPastedImageVisible(), false);
  assert.equal(model.getUserInput(), '');
  unsubscribe();
  const previous = updates;
  model.setInput('ignored by observer');
  assert.equal(updates, previous);
});

test('panel tracks messages and prevents duplicate thinking sounds', async () => {
  let starts = 0, stops = 0;
  const model = new PanelViewModel({ startThinkingSoundLoop() { starts++; }, stopThinkingSoundLoop() { stops++; } });
  model.showThinkingIndicator();
  model.showThinkingIndicator();
  assert.equal(starts, 1);
  assert.equal(model.getSnapshot().thinking, true);
  model.hideThinkingIndicator();
  assert.equal(stops, 1);
  model.appendMessage('assistant', '<p>Hello</p>');
  await model.appendUserMessageWithImage({ text: 'hi', imageUrl: null });
  await model.appendPreviewMessage('text', 'preview');
  const messages = model.getSnapshot().messages;
  assert.deepEqual(messages.map(message => message.kind), ['html', 'user', 'preview']);
  assert.equal(new Set(messages.map(message => message.id)).size, 3);
  model.showPastedImagePreview('image');
  model.clearConversation();
  assert.deepEqual(model.getSnapshot().messages, []);
  assert.equal(model.isPastedImageVisible(), false);
});
