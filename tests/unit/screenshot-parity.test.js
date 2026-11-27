import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenshotController as Controller } from '../../src/action/screenShot.ts';

afterEach(() => { delete globalThis.chrome; });

  test('screenshot page-info messaging handles missing and error responses', async () => {
    let response;
    globalThis.chrome = { runtime: { sendMessage: (_request, callback) => callback(response) } };
    const controller = new Controller();
    await assert.rejects(controller.getPageInfo(), /No response/);
    response = { error: 'denied' };
    await assert.rejects(controller.getPageInfo(), /denied/);
    response = { dimensions: null };
    await assert.rejects(controller.getPageInfo(), /null\/undefined/);
    response = { dimensions: { scrollHeight: 400, clientHeight: 100 } };
    assert.deepEqual(await controller.getPageInfo(), response.dimensions);
    chrome.runtime.lastError = { message: 'disconnected' };
    await assert.rejects(controller.getPageInfo(), /Messaging error: disconnected/);
  });

  test('screenshot stops when the page cannot scroll further', async t => {
    t.mock.method(globalThis, 'setTimeout', fn => { queueMicrotask(fn); return 1; });
    let captures = 0;
    globalThis.chrome = { tabs: { captureVisibleTab: async () => { captures++; return 'image'; } } };
    const controller = new Controller();
    const scrolls = [];
    controller.executeScroll = async (_tab, y) => scrolls.push(y);
    controller.getScrollPosition = async () => 0;
    await controller.captureScreenshots({ id: 1 }, { scrollHeight: 300, clientHeight: 100 });
    assert.equal(captures, 1);
    assert.deepEqual(scrolls, [0, 40, 0]);
  });
