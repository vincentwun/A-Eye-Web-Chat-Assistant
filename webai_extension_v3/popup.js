const imageDescriptor = (function () {
    let imageUploader = undefined;
    let imageRenderer = undefined;
    let outputElement = undefined;
    let screenshotBtn = undefined;
    let preloader = undefined;
    let keepAliveInterval;

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
            outputElement.innerText = "截圖失敗。請稍後再試。";
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

    function startKeepAlive() {
        keepAliveInterval = setInterval(() => {
            chrome.runtime.sendMessage({ action: "keepAlive" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log("Keep-alive message failed, restarting interval");
                    clearInterval(keepAliveInterval);
                    startKeepAlive();
                }
            });
        }, 25000);  // 每25秒發送一次
    }

    async function initiate(imageUploaderID, imageRendererID, outputElementID, screenshotBtnID, preloaderID) {
        imageUploader = document.getElementById(imageUploaderID);
        imageRenderer = document.getElementById(imageRendererID);
        outputElement = document.getElementById(outputElementID);
        screenshotBtn = document.getElementById(screenshotBtnID);
        preloader = document.getElementById(preloaderID);

        imageUploader.addEventListener('change', handleImageUpload);
        screenshotBtn.addEventListener('click', handleScreenshot);

        // 檢查model是否已加載
        chrome.runtime.sendMessage({ action: "getModelStatus" }, function (response) {
            if (response && response.loaded) {
                preloader.style.display = 'none';
            } else {
                preloader.innerHTML = '<h2>正在加載 AI 模型，請稍候...</h2>';
                // 監聽model加載
                chrome.runtime.onMessage.addListener((message) => {
                    if (message.action === "modelLoaded") {
                        preloader.style.display = 'none';
                    }
                });
            }
        });

        startKeepAlive();

        // 保持與 background script 的連接
        chrome.runtime.connect();
    }

    return {
        init: initiate
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    const IMAGE_UPLOADER = 'imageUpload';
    const IMAGE_RENDERER = 'imageRenderer';
    const OUTPUT_ELEMENT = 'output';
    const SCREENSHOT_BTN = 'screenshotBtn';
    const PRELOADER = 'preloader';

    imageDescriptor.init(IMAGE_UPLOADER, IMAGE_RENDERER, OUTPUT_ELEMENT, SCREENSHOT_BTN, PRELOADER);
});