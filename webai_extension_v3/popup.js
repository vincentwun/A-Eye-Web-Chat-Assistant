import * as transformers from "./transformers300.js";

const { pipeline, env, Florence2ForConditionalGeneration, AutoProcessor, AutoTokenizer, RawImage } = transformers;

const imageDescriptor = (function () {
    let model = undefined;
    let processor = undefined;
    let tokenizer = undefined;

    let imageUploader = undefined;
    let imageRenderer = undefined;
    let outputElement = undefined;
    let screenshotBtn = undefined;

    let task = '<MORE_DETAILED_CAPTION>';
    let debug = false;
    let loadedCallback = undefined;

    async function loadModels() {
        const model_id = 'onnx-community/Florence-2-base-ft';
        model = await Florence2ForConditionalGeneration.from_pretrained(model_id, { dtype: 'fp32', device: 'webgpu' });
        processor = await AutoProcessor.from_pretrained(model_id);
        tokenizer = await AutoTokenizer.from_pretrained(model_id);
        if (debug) {
            console.log('模型已加載完成!');
        }
        if (loadedCallback) {
            loadedCallback();
        }
    }

    async function handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async function (e) {
                imageRenderer.innerHTML = `<img src="${e.target.result}" style="max-width: 100%;">`;
                await describeImage(e.target.result);
            }
            reader.readAsDataURL(file);
        }
    }

    async function handleScreenshot() {
        try {
            const response = await chrome.runtime.sendMessage({ action: "takeScreenshot" });
            if (response && response.imageDataUrl) {
                imageRenderer.innerHTML = `<img src="${response.imageDataUrl}" style="max-width: 100%;">`;
                await describeImage(response.imageDataUrl);
            }
        } catch (error) {
            console.error("截圖過程中發生錯誤:", error);
        }
    }

    async function describeImage(imageUrl) {
        try {
            const image = await RawImage.fromURL(imageUrl);
            const vision_inputs = await processor(image);
            const prompts = processor.construct_prompts(task);
            const text_inputs = tokenizer(prompts);

            const generated_ids = await model.generate({
                ...text_inputs,
                ...vision_inputs,
                max_new_tokens: 1000,
            });

            const generated_text = tokenizer.batch_decode(generated_ids, { skip_special_tokens: false })[0];
            const result = processor.post_process_generation(generated_text, task, image.size);
            let imgDesc = result[task];

            outputElement.innerText = imgDesc;

            speakDescription(imgDesc);

            if (debug) {
                console.log("圖片描述: " + imgDesc);
            }
        } catch (error) {
            console.error("圖片描述過程中發生錯誤:", error);
            outputElement.innerText = "無法生成圖片描述。請稍後再試。";
        }
    }

    function speakDescription(text) {
        chrome.tts.speak(text, {
            'lang': 'en-US',
            'rate': 1.0,
            'pitch': 1.0,
            'onEvent': function (event) {
                if (event.type === 'error') {
                    console.error('TTS 錯誤:', event);
                }
            }
        });
    }

    async function initiate(imageUploaderID, imageRendererID, outputElementID, screenshotBtnID, config, callback) {
        env.allowLocalModels = false;
        env.backends.onnx.wasm.proxy = false;

        imageUploader = document.getElementById(imageUploaderID);
        imageRenderer = document.getElementById(imageRendererID);
        outputElement = document.getElementById(outputElementID);
        screenshotBtn = document.getElementById(screenshotBtnID);

        imageUploader.addEventListener('change', handleImageUpload);
        screenshotBtn.addEventListener('click', handleScreenshot);

        if (config) {
            task = config.task ? config.task : task;
            debug = config.debugLogs ? config.debugLogs : debug;
        }

        if (callback) {
            loadedCallback = callback;
        }

        await loadModels();
    }

    return {
        init: initiate
    };
})();

function loaded() {
    let preloader = document.getElementById('preloader');
    preloader.style.display = 'none';
}

const IMAGE_UPLOADER = 'imageUpload';
const IMAGE_RENDERER = 'imageRenderer';
const OUTPUT_ELEMENT = 'output';
const SCREENSHOT_BTN = 'screenshotBtn';

const CONFIG = {
    task: '<MORE_DETAILED_CAPTION>',
    debugLogs: true
};

imageDescriptor.init(IMAGE_UPLOADER, IMAGE_RENDERER, OUTPUT_ELEMENT, SCREENSHOT_BTN, CONFIG, loaded);