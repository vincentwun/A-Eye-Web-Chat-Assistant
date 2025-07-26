<p align="center">
    <h1 align="center">A-Eye Web Chat Assistant</h1>
</p>

<div align="center">

![Chrome](https://img.shields.io/badge/browser-Chrome-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20MacOS%20|%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

</div>

A-Eye Web Chat Assistant is a free and open-source Chrome extension. It's designed to make web Browse easier for visually impaired users through AI chat, screen analysis, and voice controls. You can choose between privacy-focused local AI (via Ollama with Gemma 3) or powerful cloud-based AI (Google Gemini 2.5).

---
## Table of Contents
- [Read in Chinese](./README.zh.md)
- [Features](#features)
- [How to install](#how-to-install)
- [How to Use](#how-to-use)
  - [Local Ollama Setup: Option 1 - Manual](#local-ollama-setup-option-1---manual)
  - [Local Ollama Setup: Option 2 - Script](#local-ollama-setup-option-2---script)
  - [Cloud Setup: Option 1 - Google AI Studio](#cloud-setup-option-1---google-ai-studio)
  - [Cloud Setup: Option 2 - GCP Vertex AI](#cloud-setup-option-2---gcp-vertex-ai)
  - [Basic Interaction](#basic-interaction)
  - [Analyzing Web Content](#analyzing-web-content)
- [Architecture and Technologies](#architecture-and-technologies)
- [Privacy](#privacy)
- [Credits](#credits)
- [License](#license)

---
## Features

-   **AI Screen Analysis (Visual & Text)**: Instantly analyzes screenshots or full page content using Gemini/Gemma 3.
-   **Full Voice Control & Q&A**: Operate everything and ask questions about the page using your voice.
-   **Selectable AI**: Cloud Gemini / Local Gemma 3: One-click switch between powerful cloud AI and private local AI (via Ollama).
-   **Cross-Platform Compatibility**: Works on Windows, macOS, and Linux computers using the Google Chrome browser.

---
## How to install

### Chrome Web Store

https://chromewebstore.google.com/detail/a-eye-web-chat-assistant/cdjignhknhdkldbjijipaaamodpfjflp

### Manual download

1. Download the ZIP file from this link: 
[https://github.com/vincentwun/A-Eye-Web-Chat-Assistant/archive/refs/heads/main.zip](https://github.com/vincentwun/A-Eye-Web-Chat-Assistant/archive/refs/heads/main.zip) 
and unzip it.
2. Open Chrome, go to `chrome://extensions`, and turn on "Developer mode" in the top right.
3. Click "Load unpacked" at the top left and select the **src** folder from where you unzipped the file.

---
## How to Use

### Local Ollama Setup: Option 1 - Manual

1. **Install [Ollama](https://ollama.com/).**
2. **Set Ollama CORS Permissions** (For Windows users)
    Open CMD with admin right and run:
    ```
    setx OLLAMA_ORIGINS "chrome-extension://*" /M
    ```
    Then run
    ```
    echo %OLLAMA_ORIGINS%
    ```
    to verify, the output should be **'chrome-extension://*'**

3. **Restart Ollama**

4. **Download and Run Gemma 3**
   You can refer to the table below to get Gemma 3:

   | GPU VRAM | Recommend Model | Open CMD and run        |
   | -------- | --------------- | ----------------------- |
   | >= 6GB   | Gemma 3 4B      | `ollama run gemma3:4b`  |
   | >= 10GB  | Gemma 3 12B     | `ollama run gemma3:12b` |
   | >= 20GB  | Gemma 3 27B     | `ollama run gemma3:27b` |

5.  In the extension's **Settings**, make sure "Local Model Name" is `gemma3:4b` (or the model you chose).

---
### Local Ollama Setup: Option 2 - Script

1. Open Powershell
* **Determine to use which script:**

   | Model       | PowerShell                  |
   | ----------- | --------------------------- |
   | Gemma 3 4B  | setup_ollama_gemma3_4b.ps1  |
   | Gemma 3 12B | setup_ollama_gemma3_12b.ps1 |
   | Gemma 3 27B | setup_ollama_gemma3_27b.ps1 |

2. run
```
powershell.exe -ExecutionPolicy Bypass -File "C:\Path\To\Your\Script\setup_ollama_gemma3_4b.ps1"
```
Example:
```
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\test\Downloads\A-Eye-Web-Chat-Assistant-main\A-Eye-Web-Chat-Assistant-main\powershell_script\setup_ollama_gemma3_4b.ps1"
```

The script will help you to download Ollama, CORS setup, and model execution.

3.  In the extension's **Settings**, make sure "Local Model Name" is `gemma3:4b` (or the model you chose).

---
### Cloud Setup: Option 1 - Google AI Studio
1. Get your Gemini API Key from [Google AI Studio](https://aistudio.google.com/)
2. `Get API KEY` > `Create API Key` > `Copy`
3. Go to the extension's **Settings**, input your API Key under "Cloud API Key".

---
### Cloud Setup: Option 2 - GCP Vertex AI

For more details on GCP settings, see [GCP README.md](gcp/gcloud/README.md)

---
### Basic Interaction

1.  **Open Side Panel**: Use shortcut `Alt+Shift+Q`.
2.  **Select AI Mode**: Use shortcut `Alt+Shift+1` or click the Desktop icon (Local) / Cloud icon (Cloud) in the header.
3.  **Voice Input**: Use shortcut `Alt+Shift+2` or Click the Microphone icon .
4. **Repeat Last Response**: Use shortcut `Alt+Shift+3` or click the Redo icon.
5. **Clear Conversation**: Click the `Trash` icon in the header or input `clear` to clear the chat.

---
### Analyzing Web Content

-   **Capture Visible Area**: Click the Camera icon or activate voice input to say "Take a screenshot."
-   **Capture Full Page**: Click the Scroll icon or activate voice input to say "Take a scrolling screenshot."
-   **Analyze Text Content**: Click the File icon or activate voice input to say "Analyze content."

## Architecture and Technologies

**Chrome Extension and Web APIs:**

**Chrome Scripting API:** Executing content scripts with Readability.js.

**Canvas API:** Used to merge multiple screenshots to implement the Scrolling Screenshot feature.

**Fetch API:** Used to make network requests to backend APIs (Gemini / Ollama).

**Web Speech API:**

`SpeechRecognition`: Converting speech to text (STT).

`SpeechSynthesis`: Converting text to speech (TTS).

**Google Cloud Platform (GCP):**

**API Gateway:** Provides a secure URL endpoint for cloud requests. Routes verified requests (via API key) to the Cloud Function.

**Cloud Functions:** Receives requests from API Gateway. Calls Vertex AI (Gemini) to process data and returns the response.

**Vertex AI:** Hosts the Gemini AI model. Analyzes the provided web content (text/images).

![architecture](/images/architecture_v2.png)

---
## Privacy

A-Eye Web Chat Assistant is designed with privacy in mind:

-   **No Data Collection:** This extension does not collect or send your personal data or Browse history to our servers. When using Cloud Mode, data is sent directly to the AI service you have configured.
-   **Local Storage:** All your settings, including API keys for Cloud Mode, are stored securely in your browser's local storage and cannot be accessed by websites.
-   **Local AI:** When you use Local Mode (Ollama), all AI processing stays on your computer, giving you maximum privacy for your data.

---
## Credits

This extension incorporates the following third-party components:
-   **Readability.js**: Used for extracting article text content.
    -   Source: [https://github.com/mozilla/readability](https://github.com/mozilla/readability)

---
## License
Under the MIT License.