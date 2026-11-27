import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandProcessor } from '../../src/components/commandMap.ts';

test('recognizes element discovery and quoted commands', () => {
  const processor = new CommandProcessor({ handleError() {} });
  assert.deepEqual(processor.processResponse(' "getElement" '), { command: 'getElement' });
});

for (const [command, handler] of [
  ['takeScreenshot', '_executeScreenshot'],
  ['scrollingScreenshot', '_executeScrollingScreenshot'],
  ['analyzeContent', '_executeContentAnalysis'],
  ['analyseContent', '_executeContentAnalysis'],
]) {
  test(`dispatches ${command}`, () => {
    let calls = 0;
    const processor = new CommandProcessor({ handleError() {}, [handler]: () => calls++ });
    assert.equal(processor.processResponse(command), true);
    assert.equal(calls, 1);
  });
}

test('parses raw and fenced action arrays', () => {
  const processor = new CommandProcessor({ handleError() {} });
  const expected = { command: 'executeActions', actions: [{ action: 'click', selector: '#x' }] };
  assert.deepEqual(processor.processResponse('[{"action":"click","selector":"#x"}]'), expected);
  assert.deepEqual(processor.processResponse('```json\n[{"action":"click","selector":"#x"}]\n```'), expected);
});

test('ignores ordinary responses and malformed or empty action arrays', () => {
  const processor = new CommandProcessor({ handleError() {} });
  for (const input of ['hello', '[]', '[invalid]', '[{"selector":"#x"}]', '', null]) {
    assert.equal(processor.processResponse(input), false);
  }
});

test('reports a synchronous command handler failure', () => {
  const error = new Error('capture failed');
  let reported;
  const processor = new CommandProcessor({
    _executeScreenshot() { throw error; },
    handleError: (...args) => { reported = args; },
  });
  assert.equal(processor.processResponse('takeScreenshot'), true);
  assert.deepEqual(reported, ['Failed internal screenshot command', error]);
});

test('missing command handlers return false and handlers retain their actions receiver', () => {
  const actions = { handleError() {}, marker: 0, _executeScreenshot() { this.marker++; } };
  const processor = new CommandProcessor(actions);
  assert.equal(processor.processResponse('takeScreenshot'), true);
  assert.equal(actions.marker, 1);
  assert.equal(processor.processResponse('scrollingScreenshot'), false);
  assert.equal(processor.processResponse('analyzeContent'), false);
});
