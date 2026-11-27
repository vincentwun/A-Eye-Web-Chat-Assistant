import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenshotController as ScreenshotControllerTypeScript } from '../../src/action/screenShot.ts';
import { ScreenshotAction as ScreenshotActionTypeScript } from '../../src/action/screenshotAction.ts';
import { GetElementAction as GetElementActionTypeScript } from '../../src/action/getElementAction.ts';
import { ContentExtractor as MigratedContentExtractor } from '../../src/action/contentExtractor.ts';
import * as typedUtils from '../../src/background/backgroundUtils.ts';

afterEach(() => { delete globalThis.chrome; delete globalThis.document; delete globalThis.Readability; });

for (const [name, { getCurrentTab, executeScriptOnTab, getPageDimensions }] of [['TypeScript', typedUtils]]) {
test(`${name}: active tab lookup falls back to another window and rejects absent tabs`, async () => {
  let calls = 0;
  globalThis.chrome = { tabs: { query: async () => ++calls === 1 ? [] : [{ id: 8 }] } };
  assert.equal((await getCurrentTab()).id, 8);
  chrome.tabs.query = async () => [];
  await assert.rejects(getCurrentTab(), /Could not find/);
});
test(`${name}: script execution returns results and reports injection errors`, async () => {
  globalThis.chrome = { runtime: {}, scripting: { executeScript: async () => [{ result: 123 }] } };
  function example() {}
  assert.equal(await executeScriptOnTab(1, example), 123);
  chrome.scripting.executeScript = async () => [{ result: { error: 'bad target' } }];
  await assert.rejects(executeScriptOnTab(1, example), /bad target/);
  await assert.rejects(executeScriptOnTab(null, example), /valid tabId/);
});
test(`${name}: page dimensions are returned or null if scripting fails`, async () => {
  globalThis.chrome = { scripting: { executeScript: async () => [{ result: { scrollHeight: 500, clientHeight: 100 } }] } };
  assert.equal((await getPageDimensions(1)).scrollHeight, 500);
  chrome.scripting.executeScript = async () => { throw new Error('restricted'); };
  assert.equal(await getPageDimensions(1), null);
});

}

for (const ScreenshotController of [ScreenshotControllerTypeScript]) {

test('visible screenshot returns data and exposes capture failures', async () => {
  globalThis.chrome = { tabs: { captureVisibleTab: async () => 'data:image/png;base64,abc' } };
  const controller = new ScreenshotController();
  assert.equal(await controller.captureVisibleTab(), 'data:image/png;base64,abc');
  chrome.tabs.captureVisibleTab = async () => { throw new Error('restricted'); };
  await assert.rejects(controller.captureVisibleTab(), /Screenshot capture failed: restricted/);
});
test('screenshot dimensions must have nonnegative scroll height and positive viewport height', () => {
  const controller = new ScreenshotController();
  assert.equal(controller.validatePageInfo({ scrollHeight: 200, clientHeight: 100 }), true);
  for (const value of [null, {}, { scrollHeight: -1, clientHeight: 5 }, { scrollHeight: 1, clientHeight: 0 }]) {
    assert.ok(!controller.validatePageInfo(value));
  }
});
test('non-scrolling screenshot captures the visible tab and validates dimensions', async () => {
  const controller = new ScreenshotController();
  controller.getPageInfo = async () => ({ scrollHeight: 100, clientHeight: 100 });
  controller.captureVisibleTab = async () => 'image';
  assert.equal(await controller.handleScrollingScreenshot({ id: 1 }), 'image');
  controller.getPageInfo = async () => ({ scrollHeight: 100, clientHeight: 0 });
  await assert.rejects(controller.handleScrollingScreenshot({ id: 1 }), /Invalid page dimensions/);
});
test('scrolling screenshot captures distinct positions and returns to the top', async t => {
  t.mock.method(globalThis, 'setTimeout', fn => { queueMicrotask(fn); return 1; });
  let position = 0;
  const scrolls = [];
  globalThis.chrome = { tabs: { captureVisibleTab: async () => `image-${position}` } };
  const controller = new ScreenshotController();
  controller.executeScroll = async (_tab, y) => { position = y; scrolls.push(y); };
  controller.getScrollPosition = async () => position;
  await controller.captureScreenshots({ id: 1 }, { scrollHeight: 300, clientHeight: 100 });
  assert.deepEqual(controller.scrollingScreenshotImages, [
    { image: 'image-0', y: 0 }, { image: 'image-40', y: 40 }, { image: 'image-80', y: 80 },
    { image: 'image-120', y: 120 }, { image: 'image-160', y: 160 }, { image: 'image-200', y: 200 },
  ]);
  assert.equal(scrolls.at(-1), 0);
});
test('scrolling screenshot propagates capture failure', async t => {
  t.mock.method(globalThis, 'setTimeout', fn => { queueMicrotask(fn); return 1; });
  globalThis.chrome = { tabs: { captureVisibleTab: async () => { throw new Error('capture denied'); } } };
  const controller = new ScreenshotController();
  controller.executeScroll = async () => {};
  controller.getScrollPosition = async () => 0;
  await assert.rejects(controller.captureScreenshots({ id: 1 }, { scrollHeight: 300, clientHeight: 100 }), /capture denied/);
});
test('screenshot stitch uses captured positions', async () => {
  const drawCalls = [];
  const canvas = { getContext: () => ({ clearRect() {}, drawImage: (...args) => drawCalls.push(args) }), toDataURL: () => 'merged' };
  globalThis.document = { createElement: () => canvas };
  const controller = new ScreenshotController();
  controller.loadImage = async name => ({ name, width: 120 });
  assert.equal(await controller.mergeScreenshots([{ image: 'first', y: 0 }, { image: 'second', y: 80 }], { scrollHeight: 180 }), 'merged');
  assert.equal(canvas.width, 120);
  assert.equal(canvas.height, 180);
  assert.equal(drawCalls[1][2], 80);
  await assert.rejects(controller.mergeScreenshots([], { scrollHeight: 1 }), /No screenshots/);
});

}

function dependencies() {
  const calls = { processing: [], errors: [], responses: [], requests: [], messages: [], images: [] };
  let processing = false;
  const deps = {
    screenshotController: { captureVisibleTab: async () => 'data:image/jpeg;base64,abc', handleScrollingScreenshot: async () => 'data:image/png;base64,xyz' },
    uiManager: { showThinkingIndicator() {}, escapeHTML: text => text, appendPreviewMessage: async () => {} },
    voiceController: { speakText: async () => {} },
    apiService: { sendRequest: async (...args) => { calls.requests.push(args); return 'answer'; } },
    stateManager: { getPrompts: () => ({ screenshot_prompt: 'visible prompt', scrollingScreenshot_prompt: 'scroll prompt', getElement_prompt: 'elements', system_prompt: { web_assistant: 'system' } }), isProcessing: () => processing },
    getApiConfig: () => ({ mode: 'local' }), getHistoryToSend: () => [],
    handleResponse: async value => calls.responses.push(value), handleError: (...args) => calls.errors.push(args),
    setProcessing: value => { processing = value; calls.processing.push(value); },
    appendMessage: (...args) => calls.messages.push(args), updateLastImageData: async (...args) => calls.images.push(args),
  };
  return { deps, calls };
}
for (const ScreenshotAction of [ScreenshotActionTypeScript]) {
for (const type of ['visible', 'scrolling']) {
  test(`${type} screenshot is sent for analysis with the correct prompt and image`, async () => {
    globalThis.chrome = { tabs: { query: async () => [{ id: 1 }] } };
    const { deps, calls } = dependencies();
    await new ScreenshotAction(deps).execute(type);
    assert.deepEqual(calls.processing, [true, false]);
    assert.equal(calls.requests[0][2].prompt, type === 'visible' ? 'visible prompt' : 'scroll prompt');
    assert.equal(calls.images[0][1], type === 'visible' ? 'image/jpeg' : 'image/png');
    assert.deepEqual(calls.responses, ['answer']);
  });
}
test('screenshot action reports an empty capture and clears processing', async () => {
  const { deps, calls } = dependencies();
  deps.screenshotController.captureVisibleTab = async () => '';
  await new ScreenshotAction(deps).execute();
  assert.match(calls.errors[0][1].message, /empty data/);
  assert.deepEqual(calls.processing, [true, false]);
});

}

for (const GetElementAction of [GetElementActionTypeScript]) {
test('element action previews and analyzes discovered elements', async () => {
  globalThis.chrome = { runtime: { sendMessage: async () => ({ success: true, elements: [{ selector: '#button' }] }) } };
  const { deps, calls } = dependencies();
  await new GetElementAction(deps).execute();
  assert.match(calls.requests[0][2].prompt, /#button/);
  assert.deepEqual(calls.responses, ['answer']);
  assert.deepEqual(calls.processing, [true, false]);
});
test('element action announces an empty result and handles messaging errors', async () => {
  globalThis.chrome = { runtime: { sendMessage: async () => ({ success: true, elements: [] }) } };
  const { deps, calls } = dependencies();
  const action = new GetElementAction(deps);
  await action.execute();
  assert.match(calls.messages[0][1], /couldn't find/);
  chrome.runtime.sendMessage = async () => ({ success: false, error: 'denied' });
  await action.execute();
  assert.match(calls.errors[0][1].message, /denied/);
});

}

for (const ContentExtractor of [MigratedContentExtractor]) {
test('content extraction returns Readability results and handles restricted pages', async () => {
  const injections = [];
  globalThis.chrome = { scripting: { executeScript: async options => { if (options.files) { injections.push(options.files); return []; } return [{ result: { success: true, content: 'text', title: 'Title', method: 'Readability' } }]; } } };
  assert.deepEqual(await ContentExtractor.extractPageContent({ id: 1 }), { content: 'text', title: 'Title', method: 'Readability' });
  assert.deepEqual(injections, [['readability.js']]);
  chrome.scripting.executeScript = async () => { throw new Error('Cannot access contents of url'); };
  await assert.rejects(ContentExtractor.extractPageContent({ id: 1 }), /Cannot access content on this page/);
});
test('content extraction handles missing, blank, and inaccessible results', async () => {
  await assert.rejects(ContentExtractor.extractPageContent({}), /Invalid tab/);
  globalThis.chrome = { scripting: { executeScript: async options => options.files ? [] : [{ frameId: 0, result: { success: true, content: '  ', method: 'Fallback' } }] } };
  await assert.rejects(ContentExtractor.extractPageContent({ id: 1 }), /No content extracted/);
  chrome.scripting.executeScript = async options => options.files ? [] : [{ }];
  await assert.rejects(ContentExtractor.extractPageContent({ id: 1 }), /did not execute correctly/);
  chrome.scripting.executeScript = async options => { if (options.files) return []; throw new Error('No tab with id: 1'); };
  await assert.rejects(ContentExtractor.extractPageContent({ id: 1 }), /tab was closed/);
});
test('content extraction falls back when Readability is absent or throws', async () => {
  globalThis.document = { body: { innerText: 'page text' }, cloneNode: () => ({}) };
  globalThis.chrome = { scripting: { executeScript: async options => options.files ? [] : [{ result: options.func() }] } };
  delete globalThis.Readability;
  assert.equal((await ContentExtractor.extractPageContent({ id: 1 })).content, 'page text');
  globalThis.Readability = class { parse() { throw new Error('parse failed'); } };
  assert.equal((await ContentExtractor.extractPageContent({ id: 1 })).method, 'Fallback');
  document.body.innerText = '';
  await assert.rejects(ContentExtractor.extractPageContent({ id: 1 }), /parse failed/);
});
test('content extraction executes Readability and falls back to page text', async () => {
  globalThis.document = { body: { innerText: 'fallback text' }, cloneNode: () => ({}) };
  globalThis.Readability = class { parse() { return { title: 'Article', textContent: 'article text' }; } };
  globalThis.chrome = { scripting: { executeScript: async options => options.files ? [] : [{ result: options.func() }] } };
  assert.deepEqual(await ContentExtractor.extractPageContent({ id: 1 }), { content: 'article text', title: 'Article', method: 'Readability' });
  globalThis.Readability = class { parse() { return null; } };
  assert.deepEqual(await ContentExtractor.extractPageContent({ id: 1 }), { content: 'fallback text', title: undefined, method: 'Fallback' });
});

}
