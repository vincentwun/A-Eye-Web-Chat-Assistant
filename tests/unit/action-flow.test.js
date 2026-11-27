import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ActionFlowController } from "../../src/components/actionFlowController.ts";
import { ContentAnalysisAction } from "../../src/action/contentAnalysisAction.ts";
import { ContentExtractor } from "../../src/action/contentExtractor.ts";

const originalExtract = ContentExtractor.extractPageContent;
afterEach(() => {
  delete globalThis.chrome;
  ContentExtractor.extractPageContent = originalExtract;
});

function makeDeps() {
  const calls = {
    messages: [],
    errors: [],
    responses: [],
    requests: [],
    processing: [],
  };
  let processing = false;
  const deps = {
    prompts: {
      jsonGeneration_prompt:
        "User: {userContext}; elements: {elementsJsonString}",
    },
    state: { messages: [{ role: "user", content: "press the button" }] },
    stateManager: {
      isProcessing: () => processing,
      getPrompts: () => ({
        analyzeContent_prompt: "Summarize",
        system_prompt: { web_assistant: "system" },
      }),
    },
    uiManager: {
      escapeHTML: (text) => text.replaceAll("<", "&lt;"),
      appendPreviewMessage: async () => {},
      showThinkingIndicator() {},
    },
    voiceController: { speakText: async () => {} },
    apiService: {
      sendRequest: async (...args) => {
        calls.requests.push(args);
        return "answer";
      },
    },
    getApiConfig: () => ({ mode: "local" }),
    getHistoryToSend: () => ["history"],
    handleResponse: async (response) => calls.responses.push(response),
    handleError: (...args) => calls.errors.push(args),
    appendMessage: (...args) => calls.messages.push(args),
    setProcessing: (value) => {
      processing = value;
      calls.processing.push(value);
    },
  };
  return { deps, calls };
}

test("action flow generates a proposal from the latest user intent and discovered elements", async () => {
  globalThis.chrome = {
    runtime: {
      sendMessage: async () => ({
        success: true,
        elements: [{ selector: "#button" }],
      }),
    },
  };
  const { deps, calls } = makeDeps();
  await new ActionFlowController(deps).handleGetElementRequest();
  assert.match(calls.requests[0][2].prompt, /press the button/);
  assert.match(calls.requests[0][2].prompt, /#button/);
  assert.deepEqual(calls.responses, ["answer"]);
});
test("action flow reports missing elements and discovery failures", async () => {
  globalThis.chrome = {
    runtime: { sendMessage: async () => ({ success: true, elements: [] }) },
  };
  const { deps, calls } = makeDeps();
  const flow = new ActionFlowController(deps);
  await flow.handleGetElementRequest();
  assert.match(calls.messages[0][1], /couldn't find/);
  chrome.runtime.sendMessage = async () => ({
    success: false,
    error: "failed",
  });
  await flow.handleGetElementRequest();
  assert.match(calls.errors[0][1].message, /failed/);
  assert.deepEqual(calls.processing, [false, false]);
});
test("action flow forwards proposed actions and reports execution outcome", async () => {
  const sent = [];
  globalThis.chrome = {
    runtime: {
      sendMessage: async (message) => {
        sent.push(message);
        return { success: true };
      },
    },
  };
  const { deps, calls } = makeDeps();
  const flow = new ActionFlowController(deps);
  const actions = [{ action: "click", selector: "#x", text: "X" }];
  await flow.handleExecuteActionsRequest(actions);
  assert.deepEqual(sent, [{ type: "executeActions", actions }]);
  assert.match(calls.messages[0][1], /Done/);
  chrome.runtime.sendMessage = async () => ({
    success: false,
    error: "denied",
  });
  await flow.handleExecuteActionsRequest(actions);
  assert.match(calls.errors[0][1].message, /denied/);
  assert.deepEqual(calls.processing, [false, false]);
});

test("content analysis sends extracted text with its prompt", async () => {
  globalThis.chrome = { tabs: { query: async () => [{ id: 1 }] } };
  ContentExtractor.extractPageContent = async () => ({
    content: "<article>text",
    method: "Readability",
  });
  const { deps, calls } = makeDeps();
  await new ContentAnalysisAction(deps).execute();
  assert.equal(
    calls.requests[0][2].prompt,
    "Summarize\n\n---\n\n<article>text",
  );
  assert.deepEqual(calls.responses, ["answer"]);
  assert.deepEqual(calls.processing, [true, false]);
});
test("content analysis escapes its preview and handles provider failures", async () => {
  globalThis.chrome = { tabs: { query: async () => [{ id: 1 }] } };
  ContentExtractor.extractPageContent = async () => ({ content: "<page>", method: "Readability" });
  const { deps, calls } = makeDeps();
  const previews = [];
  deps.uiManager.appendPreviewMessage = async (...args) => previews.push(args);
  deps.apiService.sendRequest = async () => { throw new Error("provider unavailable"); };
  await new ContentAnalysisAction(deps).execute();
  assert.deepEqual(previews, [["text", "&lt;page>"]]);
  assert.match(calls.errors[0][1].message, /provider unavailable/);
  assert.deepEqual(calls.processing, [true, false]);
});
test("content analysis announces fallback extraction and reports missing tabs", async () => {
  globalThis.chrome = { tabs: { query: async () => [{ id: 1 }] } };
  ContentExtractor.extractPageContent = async () => ({
    content: "text",
    method: "Fallback",
  });
  const { deps, calls } = makeDeps();
  const action = new ContentAnalysisAction(deps);
  await action.execute();
  assert.match(calls.messages[0][1], /basic text extraction/);
  chrome.tabs.query = async () => [];
  await action.execute();
  assert.match(calls.errors[0][1].message, /No active tab/);
});

