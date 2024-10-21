import * as transformers from "./transformers300.js";

const { Florence2ForConditionalGeneration, AutoProcessor, AutoTokenizer, env } = transformers;

let model, processor, tokenizer;
let isModelLoaded = false;
let keepAliveInterval;

async function loadModels() {
  if (isModelLoaded) return;

  env.allowLocalModels = false;
  env.backends.onnx.wasm.proxy = false;

  const model_id = 'onnx-community/Florence-2-base-ft';
  model = await Florence2ForConditionalGeneration.from_pretrained(model_id, { dtype: 'fp32', device: 'webgpu' });
  processor = await AutoProcessor.from_pretrained(model_id);
  tokenizer = await AutoTokenizer.from_pretrained(model_id);
  
  isModelLoaded = true;
  console.log('模型已加載完成!');
  
  chrome.runtime.sendMessage({ action: "modelLoaded" });
}

// 在安裝或更新extension時加載模型
chrome.runtime.onInstalled.addListener(() => {
  loadModels();
  startKeepAlive();
});

// 處理來自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getModelStatus") {
    sendResponse({ loaded: isModelLoaded });
  } else if (request.action === "takeScreenshot") {
    chrome.tabs.captureVisibleTab(null, {format: "png"}, (dataUrl) => {
      sendResponse({imageDataUrl: dataUrl});
    });
    return true;
  } else if (request.action === "describeImage") {
    if (!isModelLoaded) {
      sendResponse({ error: "模型尚未加載完成,請稍後再試。" });
    } else {
      describeImage(request.imageUrl).then(sendResponse);
      return true;
    }
  } else if (request.action === "keepAlive") {
    sendResponse({ status: "alive" });
  }
});

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

function startKeepAlive() {
  keepAliveInterval = setInterval(() => {
    console.log("Keeping service worker alive");
    chrome.runtime.sendMessage({ action: "keepAlive" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Keep-alive message failed, restarting interval");
        clearInterval(keepAliveInterval);
        startKeepAlive();
      }
    });
  }, 25000);  // 每25秒發送一次
}

// 保持 service worker 活躍
chrome.runtime.onConnect.addListener(function(port) {
  console.log('保持連接活躍');
  port.onDisconnect.addListener(function() {
    console.log('連接已斷開');
  });
});