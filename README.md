<p align="center">
    <h1 align="center">A-Eye Web Chat Assistant</h1>
</p>

<div align="center">

![Chrome](https://img.shields.io/badge/browser-Chrome-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20MacOS%20|%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

</div>

A-Eye Web Chat Assistant is a free and open-source Chrome extension. It's designed to make web Browse easier for visually impaired users through AI chat, screen analysis, and voice controls. You can choose between privacy-focused local AI (via Ollama with Gemma 3) or powerful cloud-based AI (like Google Gemini 2.5).

---
## Table of Contents
- [Table of Contents](#table-of-contents)
- [Features](#features)
- [Architecture and Technologies](#architecture-and-technologies)
- [Installation Guide](#installation-guide)
- [How to Use](#how-to-use)
  - [Local Setup: Ollama (Manual)](#local-setup-ollama-manual)
  - [Local Setup: Ollama (Script)](#local-setup-ollama-script)
  - [Cloud Setup: Gemini API](#cloud-setup-gemini-api)
  - [Basic Interaction](#basic-interaction)
  - [Analyzing Web Content](#analyzing-web-content)
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
## Architecture and Technologies

**Chrome Extension APIs:**
`chrome.scripting`: Executing content scripts with Readability.js.
`chrome.tabs`: Controlling browser tabs, such as opening new tabs and capturing visible tabs.
`chrome.storage`: Using `local` storage to save user settings (API Keys, URLs, Prompts, Voice Settings).
`chrome.commands`: Handling keyboard shortcuts.

**Web APIs:**
**Canvas API:** Used to merge multiple screenshots to implement the Scrolling Screenshot feature.
**Fetch API:** Used to make network requests to backend APIs (Gemini / Ollama).
**Web Speech API:**
`SpeechRecognition`: Converting speech to text (STT).
`SpeechSynthesis`: Converting text to speech (TTS).


![architecture](/images/architecture_v2.png)

---
## Installation Guide

1. Download the ZIP file from this link: 
[https://github.com/vincentwun/A-Eye-Web-Chat-Assistant/archive/refs/heads/main.zip](https://github.com/vincentwun/A-Eye-Web-Chat-Assistant/archive/refs/heads/main.zip) 
and unzip it.
1. Open Chrome, go to `chrome://extensions`, and turn on "Developer mode" in the top right.
2. Click "Load unpacked" at the top left and select the **src** folder from where you unzipped the file.

---
## How to Use

### Local Setup: Ollama (Manual)

1. **Install [Ollama](https://ollama.com/).**
2. **Set Ollama CORS Permissions** (For Windows users with admin CMD)
    Allow Ollama CORS with all Chrome extensions
    ```
    set OLLAMA_ORIGINS="chrome-extension://*"
    setx OLLAMA_ORIGINS "chrome-extension://*" /M
    ```
    Then run
    ```
    echo %OLLAMA_ORIGINS%
    ```
    to verify, the output should be **'chrome-extension://*'**

3. **Download and Run Gemma 3** 
   You can refer to the table below to get Gemma 3:

   | GPU VRAM | Recommend Model | Command                 |
   | -------- | --------------- | ----------------------- |
   | >= 6GB   | Gemma 3 4B      | `ollama run gemma3:4b`  |
   | >= 10GB  | Gemma 3 12B     | `ollama run gemma3:12b` |
   | >= 20GB  | Gemma 3 27B     | `ollama run gemma3:27b` |

4.  In the extension's **Settings**, make sure "Local Model Name" is `gemma3:4b` (or the model you chose).

### Local Setup: Ollama (Script)

*   **Easiest method.** Handles installation¹, CORS setup², and model execution³.
*   *(Requires Admin permission)*

1. **Choose your model and run the matching script:**

   | Model       | PowerShell                  |
   | ----------- | --------------------------- |
   | Gemma 3 4B  | setup_ollama_gemma3_4b.ps1  |
   | Gemma 3 12B | setup_ollama_gemma3_12b.ps1 |
   | Gemma 3 27B | setup_ollama_gemma3_27b.ps1 |

2.  In the extension's **Settings**, make sure "Local Model Name" is `gemma3:4b` (or the model you chose).

### Cloud Setup: Gemini API
1. Get your Gemini API Key from [Google AI Studio](https://aistudio.google.com/)
2. Go to the extension's **Settings**, input your API Key under "Cloud API Key".

---
### Basic Interaction

1.  **Open Side Panel**: Use shortcut `Alt+Shift+Q`.
2.  **Select AI Mode**: Use shortcut `Alt+Shift+1` or click the Desktop icon (Local) / Cloud icon (Cloud) in the header.
3.  **Voice Input**: Use shortcut `Alt+Shift+2` or Click the Microphone icon .
4. **Repeat Last Response**: Use shortcut `Alt+Shift+3` or click the Redo icon.
5. **Clear Conversation**: Click the Trash icon in the header to clear the chat.

### Analyzing Web Content

-   **Capture Visible Area**: Click the Camera icon or activate voice input to say "Take a screenshot."
-   **Capture Full Page**: Click the Scroll icon or activate voice input to say "Take a scrolling screenshot."
-   **Analyze Text Content**: Click the File icon or activate voice input to say "Analyze content."

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
-   **Font Awesome**: Provides icons for the user interface.
    -   Source: [https://fontawesome.com/](https://fontawesome.com/)

---
## License
Under the MIT License.