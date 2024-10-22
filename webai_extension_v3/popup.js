const imageDescriptor = (function () {
    let imageRenderer = undefined;
    let outputElement = undefined;
    let screenshotBtn = undefined;
    let preloader = undefined;
    let fullScreenshotBtn = undefined;
    let fullOutputElement = undefined;

    async function handleScreenshot() {
        try {
            const response = await chrome.runtime.sendMessage({ action: "takeScreenshot" });
            if (response && response.imageDataUrl) {
                imageRenderer.innerHTML = `<img src="${response.imageDataUrl}" style="max-width: 100%;">`;
                await describeImage(response.imageDataUrl);
            }
        } catch (error) {
            console.error("截圖過程中發生錯誤:", error);
            outputElement.innerText = "截圖失敗。請稍後再試。";
        }
    }

    async function handleFullScreenshot() {
        try {
            fullOutputElement.innerText = '';
            preloader.style.display = 'block';
            const response = await chrome.runtime.sendMessage({ action: "fullScreenshot" });
            if (response && response.descriptions) {
                const combinedDescriptions = response.descriptions.join('\n\n');
                fullOutputElement.innerText = combinedDescriptions;
            } else if (response && response.error) {
                fullOutputElement.innerText = response.error;
            }
        } catch (error) {
            console.error("全網頁截圖過程中發生錯誤:", error);
            fullOutputElement.innerText = "全網頁截圖失敗。請稍後再試。";
        } finally {
            preloader.style.display = 'none';
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "scrollToTop" });
            });
        }
    }

    async function describeImage(imageUrl) {
        try {
            preloader.style.display = 'block';
            const response = await chrome.runtime.sendMessage({ action: "describeImage", imageUrl: imageUrl });
            if (response.error) {
                outputElement.innerText = response.error;
            } else {
                outputElement.innerText = response.description;
                speakDescription(response.description);
            }
        } catch (error) {
            console.error("圖片描述過程中發生錯誤:", error);
            outputElement.innerText = "無法生成圖片描述。請稍後再試。";
        } finally {
            preloader.style.display = 'none';
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

    async function checkModelStatus() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "getModelStatus" }, function (response) {
                resolve(response && response.loaded);
            });
        });
    }

    async function initiate(imageRendererID, outputElementID, screenshotBtnID, preloaderID, fullScreenshotBtnID, fullOutputID) {
        imageRenderer = document.getElementById(imageRendererID);
        outputElement = document.getElementById(outputElementID);
        screenshotBtn = document.getElementById(screenshotBtnID);
        preloader = document.getElementById(preloaderID);
        fullScreenshotBtn = document.getElementById(fullScreenshotBtnID);
        fullOutputElement = document.getElementById(fullOutputID);

        screenshotBtn.addEventListener('click', handleScreenshot);
        fullScreenshotBtn.addEventListener('click', handleFullScreenshot);

        let isLoaded = await checkModelStatus();
        if (isLoaded) {
            preloader.style.display = 'none';
        } else {
            preloader.innerHTML = '<h2>正在加載 AI 模型，請稍候...</h2>';
            chrome.runtime.onMessage.addListener((message) => {
                if (message.action === "modelLoaded") {
                    preloader.style.display = 'none';
                }
            });
        }

        chrome.runtime.connect();
    }

    return {
        init: initiate
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    const IMAGE_RENDERER = 'imageRenderer';
    const OUTPUT_ELEMENT = 'output';
    const SCREENSHOT_BTN = 'screenshotBtn';
    const PRELOADER = 'preloader';
    const FULL_SCREENSHOT_BTN = 'fullScreenshotBtn';
    const FULL_OUTPUT = 'fullOutput';

    imageDescriptor.init(IMAGE_RENDERER, OUTPUT_ELEMENT, SCREENSHOT_BTN, PRELOADER, FULL_SCREENSHOT_BTN, FULL_OUTPUT);
});