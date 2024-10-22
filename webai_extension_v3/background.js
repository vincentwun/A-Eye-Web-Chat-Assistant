import * as transformers from "./transformers300.js";

const { Florence2ForConditionalGeneration, AutoProcessor, AutoTokenizer, env } = transformers;

let model, processor, tokenizer;
let isModelLoaded = false;
let loadingPromise = null;

async function loadModels() {
  if (isModelLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      env.allowLocalModels = false;
      env.backends.onnx.wasm.proxy = false;

      const model_id = 'onnx-community/Florence-2-base-ft';
      model = await Florence2ForConditionalGeneration.from_pretrained(model_id, { dtype: 'fp32', device: 'webgpu' });
      processor = await AutoProcessor.from_pretrained(model_id);
      tokenizer = await AutoTokenizer.from_pretrained(model_id);

      isModelLoaded = true;
      console.log('模型已加載完成!');

      chrome.runtime.sendMessage({ action: "modelLoaded" });
    } catch (error) {
      console.error('模型加載失敗:', error);
      isModelLoaded = false;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  loadModels();
});

loadModels();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getModelStatus") {
    sendResponse({ loaded: isModelLoaded });
    if (!isModelLoaded) {
      loadModels();
    }
  } else if (request.action === "takeScreenshot") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      sendResponse({ imageDataUrl: dataUrl });
    });
    return true;
  } else if (request.action === "describeImage") {
    if (!isModelLoaded) {
      loadModels().then(() => {
        describeImage(request.imageUrl).then(sendResponse);
      });
    } else {
      describeImage(request.imageUrl).then(sendResponse);
    }
    return true;
  } else if (request.action === "fullScreenshot") {
    handleFullScreenshot(request, sender, sendResponse);
    return true;
  }
});

async function handleFullScreenshot(request, sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    const { totalHeight, viewportHeight } = await chrome.tabs.sendMessage(tab.id, { action: "getPageInfo" });

    const scrollStep = Math.floor(viewportHeight);
    const maxScroll = totalHeight;
    let scrollPosition = 0;
    const descriptions = [];
    const capturedPositions = new Set();

    while (scrollPosition < maxScroll) {
      if (!capturedPositions.has(scrollPosition)) {
        capturedPositions.add(scrollPosition);

        await chrome.tabs.sendMessage(tab.id, { action: "scrollTo", position: scrollPosition });

        await sleep(100);

        const dataUrl = await new Promise((resolve) => {
          chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
            resolve(dataUrl);
          });
        });

        const descriptionResponse = await describeImage(dataUrl);
        if (descriptionResponse.error) {
          descriptions.push("描述失敗。");
        } else {
          descriptions.push(descriptionResponse.description);
        }
      }

      scrollPosition += scrollStep;
    }

    await chrome.tabs.sendMessage(tab.id, { action: "scrollToTop" });

    sendResponse({ descriptions: descriptions });

  } catch (error) {
    console.error("全網頁截圖過程中發生錯誤:", error);
    sendResponse({ error: "全網頁截圖失敗。請稍後再試。" });
  }
}

async function describeImage(imageUrl) {
  try {
    const image = await transformers.RawImage.fromURL(imageUrl);
    const vision_inputs = await processor(image);
    const prompts = processor.construct_prompts('<MORE_DETAILED_CAPTION>');
    const text_inputs = tokenizer(prompts);

    const generated_ids = await model.generate({
      ...text_inputs,
      ...vision_inputs,
      max_new_tokens: 1000,
    });

    const generated_text = tokenizer.batch_decode(generated_ids, { skip_special_tokens: false })[0];
    const result = processor.post_process_generation(generated_text, '<MORE_DETAILED_CAPTION>', image.size);
    return { description: result['<MORE_DETAILED_CAPTION>'] };
  } catch (error) {
    console.error("圖片描述過程中發生錯誤:", error);
    return { error: "無法生成圖片描述。請稍後再試。" };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

chrome.runtime.onConnect.addListener(function (port) {
  console.log('保持連接活躍');
  port.onDisconnect.addListener(function () {
    console.log('連接已斷開');
  });
});