const imageDescriptor = (function () {
    let imageRenderer = undefined;
    let outputElement = undefined;
    let screenshotBtn = undefined;
    let preloader = undefined;
    let fullScreenshotBtn = undefined;
    let fullOutputElement = undefined;

    // 語音輸入相關變量
    let voiceInputBtn = undefined;
    let voiceIndicator = undefined;
    let transcriptElement = undefined;
    let isListening = false;
    let recognition = null;

    // 命令模式相關
    class Command {
        execute() { }
    }

    class ScreenshotCommand extends Command {
        execute() {
            screenshotBtn.click();
        }
    }

    class OpenYouTubeCommand extends Command {
        execute() {
            chrome.tabs.create({ url: "https://www.youtube.com" });
        }
    }

    class UnknownCommand extends Command {
        execute() {
            outputElement.innerText = "抱歉，我無法理解您的指令。";
            chrome.tts.speak("抱歉，我無法理解您的指令。", {
                'lang': 'zh-HK',
                'rate': 1.0,
                'pitch': 1.0
            });
        }
    }

    const commandMap = {
        "截圖": new ScreenshotCommand(),
        "幫我截圖": new ScreenshotCommand(),
        "我想去youtube": new OpenYouTubeCommand(),
        "想去youTube": new OpenYouTubeCommand()
        // 可以在此處添加更多指令
    };

    function getCommand(text) {
        return commandMap[text] || new UnknownCommand();
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
            'lang': 'zh-HK',
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

    // 語音輸入相關函數
    function initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("您的瀏覽器不支持語音識別。請使用支持的瀏覽器，如最新版本的 Chrome。");
            return null;
        }

        const recog = new SpeechRecognition();
        recog.lang = 'zh-HK';
        recog.interimResults = true;
        recog.continuous = false;

        recog.onstart = () => {
            isListening = true;
            voiceIndicator.innerText = "正在聆聽...";
            chrome.tts.speak("正在聆聽...", {
                'lang': 'zh-HK',
                'rate': 1.0,
                'pitch': 1.0
            });
        };

        recog.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript.trim();
                } else {
                    interimTranscript += event.results[i][0].transcript.trim();
                }
            }
            transcriptElement.innerText = finalTranscript + interimTranscript;
        };

        recog.onerror = (event) => {
            console.error("語音識別錯誤:", event.error);
            voiceIndicator.innerText = "語音識別出錯。";
            chrome.tts.speak("語音識別出錯。", {
                'lang': 'zh-HK',
                'rate': 1.0,
                'pitch': 1.0
            });
            isListening = false;
            voiceInputBtn.innerText = "開始語音輸入";
        };

        recog.onend = () => {
            isListening = false;
            voiceIndicator.innerText = "語音輸入已結束。";
            voiceInputBtn.innerText = "開始語音輸入";
        };

        return recog;
    }

    function handleVoiceInput() {
        if (!isListening) {
            recognition.start();
            voiceInputBtn.innerText = "結束語音輸入";
        } else {
            recognition.stop();
            voiceInputBtn.innerText = "開始語音輸入";
        }
    }

    function processCommand(commandText) {
        const command = getCommand(commandText);
        command.execute();
    }

    function setupRecognitionListeners() {
        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript.trim();
                } else {
                    interimTranscript += event.results[i][0].transcript.trim();
                }
            }
            transcriptElement.innerText = finalTranscript + interimTranscript;

            if (finalTranscript) {
                processCommand(finalTranscript);
            }
        };
    }

    async function initiate(imageRendererID, outputElementID, screenshotBtnID, preloaderID, fullScreenshotBtnID, fullOutputID) {
        imageRenderer = document.getElementById(imageRendererID);
        outputElement = document.getElementById(outputElementID);
        screenshotBtn = document.getElementById(screenshotBtnID);
        preloader = document.getElementById(preloaderID);
        fullScreenshotBtn = document.getElementById(fullScreenshotBtnID);
        fullOutputElement = document.getElementById(fullOutputID);

        // 語音輸入相關元素
        voiceInputBtn = document.getElementById('voiceInputBtn');
        voiceIndicator = document.getElementById('voiceIndicator');
        transcriptElement = document.getElementById('transcript');

        screenshotBtn.addEventListener('click', handleScreenshot);
        fullScreenshotBtn.addEventListener('click', handleFullScreenshot);
        voiceInputBtn.addEventListener('click', handleVoiceInput);

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

        // 初始化語音識別
        recognition = initSpeechRecognition();
        if (recognition) {
            setupRecognitionListeners();
        }
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