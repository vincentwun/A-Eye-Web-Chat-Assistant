import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { executeJSON } from '../../src/action/pageAction.ts';
import { findElementsOnPage } from '../../src/action/getElement.ts';

afterEach(() => { delete globalThis.chrome; delete globalThis.document; delete globalThis.window; delete globalThis.KeyboardEvent; delete globalThis.CSS; });

function setup(element) {
  globalThis.document = { querySelector: () => element, querySelectorAll: () => element ? [element] : [] };
  globalThis.window = { getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' }) };
  globalThis.KeyboardEvent = class extends Event { constructor(type, options) { super(type, options); this.key = options.key; } };
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 7 }] }, runtime: {},
    scripting: { executeScript: async ({ func, args }) => [{ result: (0, eval)(`(${func})`)(...(args || [])) }] },
  };
}
function element() {
  return { value: '', disabled: false, readOnly: false, events: [], textContent: 'Submit',
    getAttribute: () => null, getBoundingClientRect: () => ({ width: 20, height: 10 }),
    focus() {}, blur() {}, click() { this.clicked = true; }, dispatchEvent(event) { this.events.push(event.type); return true; } };
}

test('page actions click matching targets and type text with input events', async t => {
  t.mock.method(globalThis, 'setTimeout', fn => { queueMicrotask(fn); return 1; });
  const target = element();
  setup(target);
  const result = await executeJSON([{ action: 'click', selector: '#x', text: 'Submit' }, { action: 'type', selector: '#x', text: 'hello' }]);
  assert.equal(target.clicked, true);
  assert.equal(target.value, 'hello');
  assert.deepEqual(target.events, ['input', 'change']);
  assert.deepEqual(result.map(item => item.status), ['Clicked', 'Typed']);
});
test('page actions dispatch key events', async t => {
  t.mock.method(globalThis, 'setTimeout', fn => { queueMicrotask(fn); return 1; });
  const target = element();
  setup(target);
  const result = await executeJSON([{ action: 'keypress', selector: '#x', key: 'Enter' }]);
  assert.deepEqual(target.events, ['keydown', 'keypress', 'keyup']);
  assert.equal(result[0].status, 'Key Pressed');
});
test('page actions reject missing fields and unknown actions', async () => {
  setup(null);
  await assert.rejects(executeJSON([{ action: 'click', selector: '#x' }]), /requires 'selector' and 'text'/);
  await assert.rejects(executeJSON([{ action: 'navigate' }]), /requires 'url'/);
  await assert.rejects(executeJSON([{ action: 'unknown' }]), /Unsupported JSON action/);
});
test('page actions reject target mismatch and read-only errors', async () => {
  const target = element();
  setup(target);
  target.readOnly = true;
  await assert.rejects(executeJSON([{ action: 'click', selector: '#x', text: 'Different' }]), /matching text/);
  await assert.rejects(executeJSON([{ action: 'type', selector: '#x', text: 'hello' }]), /not a writable/);
});
test('element discovery returns page results and handles inaccessible tabs', async () => {
  globalThis.chrome = { tabs: { query: async () => [{ id: 1 }] }, runtime: {}, scripting: { executeScript: async () => [{ result: [{ selector: '#x', tagName: 'button', text: 'Go' }] }] } };
  assert.deepEqual(await findElementsOnPage(), { success: true, elements: [{ selector: '#x', tagName: 'button', text: 'Go' }] });
  chrome.tabs.query = async () => [];
  const failure = await findElementsOnPage();
  assert.equal(failure.success, false);
  assert.match(failure.error, /active tab/);
});
test('element discovery extracts visible actionable elements and ignores hidden or disabled targets', async () => {
  const body = { contains: () => true };
  const button = { tagName: 'BUTTON', id: 'send', children: [], parentElement: body, disabled: false,
    classList: [], getAttribute: name => name === 'aria-label' ? 'Send message' : null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }) };
  const disabled = { ...button, id: 'disabled', disabled: true };
  const hidden = { ...button, id: 'hidden' };
  globalThis.CSS = { escape: value => value };
  globalThis.document = { body, querySelectorAll: selector => selector.startsWith('#') ? [button] : [button, disabled, hidden] };
  globalThis.window = { getComputedStyle: node => ({ display: node.id === 'hidden' ? 'none' : 'block', visibility: 'visible', opacity: '1' }) };
  globalThis.chrome = { tabs: { query: async () => [{ id: 1 }] }, runtime: {}, scripting: { executeScript: async ({ func }) => [{ result: (0, eval)(`(${func})`)() }] } };
  assert.deepEqual(await findElementsOnPage(), { success: true, elements: [{ tagName: 'button', selector: '#send', text: 'Send message' }] });
});

