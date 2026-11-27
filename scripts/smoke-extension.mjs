import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const binary = process.argv[2];
if (!binary) throw new Error('Usage: node scripts/smoke-extension.mjs <browser-binary>');
await mkdir('.wxt', { recursive: true });
const profile = await mkdtemp(path.resolve('.wxt/smoke-'));
const upgrade = process.argv.includes('--upgrade');
let extensionPath = path.resolve('.output/chrome-mv3');
if (upgrade) {
  extensionPath = await mkdtemp(path.resolve('.wxt/upgrade-extension-'));
  const legacyArchive = execFileSync('git', ['archive', '--format=tar', 'HEAD:src'], { maxBuffer: 100 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', extensionPath], { input: legacyArchive, maxBuffer: 100 * 1024 * 1024 });
  const manifestPath = path.join(extensionPath, 'manifest.json');
  const legacyManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  legacyManifest.version = '2.0.19';
  await writeFile(manifestPath, JSON.stringify(legacyManifest));
}
const requests = [];
const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/v1/chat/completions') {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      requests.push(JSON.parse(body));
      response.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      response.end(JSON.stringify({ choices: [{ message: { content: 'Mock provider response' } }] }));
    });
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end('<!doctype html><title>Extension smoke test</title><body>Test page <button id="test-button" onclick="this.textContent=\'Clicked\'">Click me</button></body>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = spawn(binary, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true });
let nextId = 0;
let buffer = '';
const pending = new Map();
browser.stdio[4].setEncoding('utf8');
browser.stdio[4].on('data', chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\0')) !== -1) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
function call(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(id, { resolve, reject, timeout });
    browser.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })}\0`);
  });
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const { id } = await call('Extensions.loadUnpacked', { path: extensionPath });
  let worker;
  let workerPath = upgrade ? 'background/background.js' : 'background.js';
  async function findWorker() {
    const { targetInfos } = await call('Target.getTargets');
    return targetInfos.find(target => target.type === 'service_worker' && target.url === `chrome-extension://${id}/${workerPath}`);
  }
  for (let i = 0; i < 100 && !worker; i++) {
    worker = await findWorker();
    if (!worker) await delay(200);
  }
  assert.ok(worker, 'Extension service worker did not start');
  let { sessionId } = await call('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  async function evaluate(expression, targetSession = sessionId) {
    let result;
    try { result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, targetSession); }
    catch (error) { throw new Error(`Evaluation failed: ${expression.slice(0, 120)}`, { cause: error }); }
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  let workerReady = false;
  for (let i = 0; i < 50 && !workerReady; i++) {
    workerReady = await evaluate(`typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.runtime`);
    if (!workerReady) await delay(100);
  }
  assert.ok(workerReady, 'Extension APIs did not become available in the service worker');
  let initialized = false;
  for (let i = 0; i < 50 && !initialized; i++) {
    initialized = await evaluate(`chrome.storage.local.get(['apiSettings','userPrompts','aeye-voice-settings']).then(data => !!(data.apiSettings && data.userPrompts && data['aeye-voice-settings']))`);
    if (!initialized) await delay(100);
  }
  assert.ok(initialized, 'Installation defaults were not initialized');
  if (upgrade) {
    await evaluate(`chrome.storage.local.set({apiSettings:{upgradeMarker:'api'},userPrompts:{upgradeMarker:'prompts'},'aeye-voice-settings':{upgradeMarker:'voice'}})`);
    await cp('.output/chrome-mv3', extensionPath, { recursive: true, force: true });
    const updated = await call('Extensions.loadUnpacked', { path: extensionPath });
    assert.equal(updated.id, id, 'The unpacked extension ID must remain stable during upgrade');
    workerPath = 'background.js';
    worker = null;
    for (let i = 0; i < 100 && !worker; i++) {
      await delay(200);
      worker = await findWorker();
    }
    if (!worker) throw new Error(`Upgraded extension service worker did not start: ${JSON.stringify(await call('Extensions.getExtensions'))}`);
    ({ sessionId } = await call('Target.attachToTarget', { targetId: worker.targetId, flatten: true }));
    workerReady = false;
    for (let i = 0; i < 50 && !workerReady; i++) {
      workerReady = await evaluate(`typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.runtime`);
      if (!workerReady) await delay(100);
    }
    assert.ok(workerReady, 'Upgraded extension APIs did not become available');
  }
  const state = await evaluate(`(async () => ({manifest: chrome.runtime.getManifest(), settings: await chrome.storage.local.get(['apiSettings', 'userPrompts', 'aeye-voice-settings']), panel: await chrome.sidePanel.getPanelBehavior()}))()`);
  assert.equal(state.manifest.name, 'A-Eye Web Chat Assistant');
  assert.ok(state.settings.apiSettings && state.settings.userPrompts && state.settings['aeye-voice-settings']);
  if (upgrade) {
    const builtManifest = JSON.parse(await readFile('.output/chrome-mv3/manifest.json', 'utf8'));
    assert.equal(state.manifest.version, builtManifest.version);
    assert.equal(state.settings.apiSettings.upgradeMarker, 'api');
    assert.equal(state.settings.userPrompts.upgradeMarker, 'prompts');
    assert.equal(state.settings['aeye-voice-settings'].upgradeMarker, 'voice');
  }
  assert.equal(state.panel.openPanelOnActionClick, true);
  const resources = await evaluate(`Promise.all(['sidepanel.html','options.html','permission/permission.html','readability.js'].map(async p => (await fetch(chrome.runtime.getURL(p))).ok))`);
  assert.ok(resources.every(Boolean));
  await evaluate(`(async () => { const {apiSettings} = await chrome.storage.local.get('apiSettings'); await chrome.storage.local.set({apiSettings: {...apiSettings, activeApiMode:'local', localApiMode:'vllm', localApiUrl:'http://127.0.0.1:${server.address().port}', vllmModelName:'smoke-model'}}); })()`);
  let panelSession;
  for (const [page, selector] of [['sidepanel.html', '#user-input'], ['options.html', '#save-button']]) {
    const { targetId } = await call('Target.createTarget', { url: `chrome-extension://${id}/${page}` });
    const { sessionId: pageSession } = await call('Target.attachToTarget', { targetId, flatten: true });
    if (page === 'sidepanel.html') panelSession = pageSession;
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) {
      await delay(100);
      ready = await evaluate(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})${page === 'sidepanel.html' ? ' && !!window.aiScreenReader' : ''}`, pageSession);
    }
    assert.ok(ready, `${page} did not load its expected control`);
    if (page === 'sidepanel.html') {
      let settingsReady = false;
      for (let i = 0; i < 50 && !settingsReady; i++) {
        settingsReady = await evaluate(`window.aiScreenReader?.stateManager.isSettingsLoaded()`, pageSession);
        if (!settingsReady) await delay(100);
      }
      assert.ok(settingsReady, 'Side panel settings did not load');
      assert.equal(await evaluate('window.aiScreenReader.configValidator.isLocalModeConfigValid()', pageSession), true, 'Configured local provider must pass validation');
      await evaluate(`(() => { const input = document.querySelector('#user-input'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Hello from smoke test'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`, pageSession);
      await evaluate(`new Promise(resolve => requestAnimationFrame(() => { document.querySelector('#send-button').click(); resolve(); }))`, pageSession);
      let responseVisible = false;
      for (let i = 0; i < 100 && !responseVisible; i++) {
        await delay(100);
        responseVisible = await evaluate(`document.querySelector('#conversation').textContent.includes('Mock provider response')`, pageSession);
      }
      assert.ok(responseVisible, `Side panel did not display mock provider response: ${await evaluate(`document.querySelector('#conversation').textContent`, pageSession)}; requests=${requests.length}`);
      assert.equal(requests[0]?.model, 'smoke-model');
      assert.ok(JSON.stringify(requests[0]?.messages).includes('Hello from smoke test'));
      const command = await evaluate(`window.aiScreenReader.commandProcessor.processResponse('"getElement"')`, pageSession);
      assert.deepEqual(command, { command: 'getElement' });
      const dispatched = await evaluate(`(() => { const processor = window.aiScreenReader.commandProcessor; const original = processor.actions._executeScreenshot; let calls = 0; processor.actions._executeScreenshot = () => calls++; try { return [processor.processResponse('takeScreenshot'), calls]; } finally { processor.actions._executeScreenshot = original; } })()`, pageSession);
      assert.deepEqual(dispatched, [true, 1]);
      const rendering = await evaluate(`new Promise(resolve => {
        window.aiScreenReader.appendMessage('assistant', ${JSON.stringify('**bold** <img src=x onerror="window.__injected=true">\n\n```javascript\nconst answer = 42;\n```')});
        requestAnimationFrame(() => { const message = document.querySelector('#conversation .message-assistant:last-child'); resolve({ bold: message.querySelector('strong')?.textContent, dangerous: !!message.querySelector('[onerror]'), highlighted: !!message.querySelector('code.hljs .hljs-keyword'), copy: !!message.querySelector('.copy-button') }); });
      })`, pageSession);
      assert.deepEqual(rendering, { bold: 'bold', dangerous: false, highlighted: true, copy: true });
    }
    if (page === 'options.html') {
      await delay(500);
      const resourceCard = await evaluate(`(() => { const card = [...document.querySelectorAll('.card')].find(el => el.querySelector('h2')?.textContent === 'Resource'); return card && [...card.querySelectorAll('.resource-links a')].map(a => ({text: a.textContent.trim(), href: a.getAttribute('href'), target: a.target})); })()`, pageSession);
      assert.deepEqual(resourceCard, [
        { text: 'Get Gemini API Key', href: 'https://aistudio.google.com/welcome', target: '_blank' },
        { text: 'Get Mistral API Key', href: 'https://mistral.ai/', target: '_blank' },
        { text: 'User Manual', href: 'https://github.com/vincentwun/A-Eye-Web-Chat-Assistant/blob/main/README.md', target: '_blank' },
      ]);
      const sliderBefore = await evaluate(`(() => { const input = document.querySelector('#ui-scale-slider'); return { min: input.min, max: input.max, step: input.step, value: input.value, label: input.getAttribute('aria-label'), display: document.querySelector('#ui-scale-value').textContent }; })()`, pageSession);
      assert.deepEqual(sliderBefore, { min: '80', max: '150', step: '5', value: String(state.settings.apiSettings.uiScale ?? 100), label: 'Adjust Size', display: (state.settings.apiSettings.uiScale ?? 100) + '%' });
      for (const [radio, visible, hidden] of [
        ['cloud-select-gemini', 'gemini-api-key-container', 'proxy-url-container'],
        ['cloud-select-gateway', 'proxy-url-container', 'gemini-api-key-container'],
        ['cloud-select-mistral', 'mistral-api-key-container', 'azure-foundry-container'],
        ['cloud-select-azure-foundry', 'azure-foundry-container', 'mistral-api-key-container'],
        ['local-select-ollama', 'ollama-model-container', 'lmstudio-model-container'],
        ['local-select-lmstudio', 'lmstudio-model-container', 'vllm-url-container'],
        ['local-select-vllm', 'vllm-url-container', 'ollama-model-container'],
      ]) {
        const visibility = await evaluate(`(() => { document.getElementById(${JSON.stringify(radio)}).click(); return [!document.getElementById(${JSON.stringify(visible)}).classList.contains('hidden'), document.getElementById(${JSON.stringify(hidden)}).classList.contains('hidden')]; })()`, pageSession);
        assert.deepEqual(visibility, [true, true], `Incorrect settings visibility for ${radio}`);
      }
      await evaluate(`(() => { const slider = document.querySelector('#ui-scale-slider'); slider.value = '125'; slider.dispatchEvent(new Event('input', { bubbles: true })); slider.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#save-button').click(); })()`, pageSession);
      let scale;
      for (let i = 0; i < 30 && scale !== 125; i++) {
        await delay(100);
        scale = await evaluate(`chrome.storage.local.get('apiSettings').then(data => data.apiSettings?.uiScale)`);
      }
      assert.equal(scale, 125, 'Options page must save settings');
    }
  }
  const tabId = await evaluate(`(async () => (await chrome.tabs.create({url: 'http://127.0.0.1:${server.address().port}/'})).id)()`);
  await evaluate(`globalThis.__micResult = null; chrome.runtime.onMessage.addListener(message => { if (message.type === 'micPermissionResult') globalThis.__micResult = message; });`);
  let response;
  for (let i = 0; i < 30 && !response; i++) {
    await delay(200);
    response = await evaluate(`chrome.tabs.sendMessage(${tabId}, {action:'requestMicPermission'}).catch(() => null)`);
  }
  assert.equal(response?.status, 'iframe injected', 'Declared permission content script must receive messages');
  let microphone;
  for (let i = 0; i < 50 && !microphone; i++) {
    await delay(100);
    microphone = await evaluate('globalThis.__micResult');
  }
  assert.equal(microphone?.status, 'granted', `Fake microphone request failed: ${JSON.stringify(microphone)}`);
  await evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},files:['content-scripts/permission.js']})`);
  await evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},files:['readability.js']})`);
  const readability = await evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:() => typeof Readability}).then(result => result[0].result)`);
  assert.equal(readability, 'function');
  const article = await evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:() => { const doc = document.implementation.createHTMLDocument('Article title'); const paragraph = 'A detailed article provides useful information about the subject. '.repeat(30); doc.body.innerHTML = '<article><h1>Article title</h1><p>' + paragraph + '</p></article>'; return new Readability(doc).parse()?.textContent; }}).then(result => result[0].result)`);
  assert.ok(article?.includes('useful information'), 'Bundled Readability must parse article content');
  const dimensions = await evaluate(`chrome.runtime.sendMessage({type:'startScrollingScreenshot'})`, panelSession);
  assert.ok(dimensions?.dimensions?.clientHeight > 0, 'Screenshot dimensions must come from the active page');
  const elements = await evaluate(`chrome.runtime.sendMessage({type:'findElements'})`, panelSession);
  assert.ok(elements?.success && elements.elements.some(element => element.selector === '#test-button'), 'Page discovery must find the test button');
  const action = await evaluate(`chrome.runtime.sendMessage({type:'executeActions',actions:[{action:'click',selector:'#test-button',text:'Click me'}]})`, panelSession);
  assert.ok(action?.success, 'Page action message must succeed');
  const buttonText = await evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:() => document.querySelector('#test-button').textContent}).then(result => result[0].result)`);
  assert.equal(buttonText, 'Clicked');
  console.log(`PASS ${path.basename(binary)}${upgrade ? ' upgrade' : ''}: settings, chat, microphone, page messaging, actions and resources`);
} finally {
  await call('Browser.close').catch(() => browser.kill());
  server.close();
}
