# A-Eye Web Chat Assistant

<div align="center">

![Chrome](https://img.shields.io/badge/browser-Chrome-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20MacOS%20|%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

</div>

A-Eye Web Chat Assistant is a free and open-source Chrome extension. It's designed to make web Browse easier for visually impaired users through AI chat, screen analysis, and voice controls. You can choose between privacy-focused local AI (via Ollama with Gemma 3) or powerful cloud-based AI (like Google Gemini API).

---
## Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [Installation Guide](#installation-guide)
- [How to Use](#how-to-use)
- [Privacy](#privacy)
- [Credits](#credits)
- [License](#license)

---
## Features

-   **See the Webpage and Ask**: Take a picture of what you see on the webpage (or the whole page) and ask the AI about it.
-   **Analyze Text Content**: Get the main text of a webpage (like an article) and have the AI summarize it or answer your questions.
-   **Speak to Text**: Talk to the AI with your voice using your microphone.
-   **Text to Speech**: The AI reads its answers to you using your computer's voices.
-   **Two Ways to Use AI**: Easily switch between two AI power sources:
    *   **Local Mode**: Runs AI on your computer (via Ollama) for better privacy. Requires initial setup.
    *   **Cloud Mode**: Uses powerful online AI (like Google Gemini). Requires your own API key.
-   **Cross-Platform Compatibility**: Works on Windows, macOS, and Linux computers using the Google Chrome browser.

---
## Architecture

(Update Soon)

![architecture](/images/architecture_v2.png)

---
## Installation Guide

### Option 1: Get Extension from GitHub

1.  **Download Source Code**:
    Download the repository ZIP file:
    ```
    https://github.com/vincentwun/A-Eye-Web-Chat-Assistant/archive/refs/heads/main.zip
    ```
    and extract it to a local folder.
2.  **Enable Chrome Developer Mode**:
    -   Open Chrome and navigate to `chrome://extensions`.
    -   In the top-right corner, toggle on "Developer mode".
3.  **Load the Extension**:
    -   Click the "Load unpacked" button that appears.
    -   Navigate to the directory where you extracted the ZIP file.
    -   Select the **src** directory (the one containing **manifest.json**).
    -   Click "Select Folder".

### Option 2: Get Extension from Chrome Web Store
```
https://chromewebstore.google.com/detail/a-eye-web-chat-assistant/cdjignhknhdkldbjijipaaamodpfjflp
```

---
## How to Use

### Setting up Local AI Mode (Ollama)

1. To use Local AI Mode: Install [Ollama](https://ollama.com/) and then run this command to get **Gemma 3**:

2. **Open the command line** (Command Prompt on Windows, Terminal on Mac/Linux).
   **You can refer to the table below to get Gemma 3:**

   | Your GPU VRAM | Recommend Size | Command                   |
   |-----------|-------------------|---------------------------|
   | 6 ~ 8GB   | Gemma 3 4B        | `ollama pull gemma3:4b`   |
   | > 10GB    | Gemma 3 12B       | `ollama pull gemma3:12b`  |
   | > 20GB    | Gemma 3 27B       | `ollama pull gemma3:27b`  |

3.  **Allow the A-eye to communicate with Ollama:**
    (Windows users):
    ```
    set origins_host='chrome-extension://*'
    ```
    (Linux or macOS users):
    ```
    export origins_host='chrome-extension://*'
    ```

4.  In the extension's **Settings**, make sure "Local Model Name" is `gemma3:4b` (or the model you chose).

### Setting up Cloud AI Mode (Gemini API)
1. Get your Gemini API Key from [Google AI Studio](https://aistudio.google.com/)
2. Go to the extension's **Settings**, input your API Key under "Cloud API Key".

---
### Basic Interaction

1.  **Open Side Panel**: Use shortcut `Alt+Shift+Q`.
2.  **Select AI Mode**: Use shortcut `Alt+Shift+1` or click the Desktop icon (Local) <i class="fas fa-desktop"></i> / Cloud icon (Cloud) <i class="fas fa-cloud"></i> in the header.
3.  **Voice Input**: Use shortcut `Alt+Shift+2` or Click the Microphone icon (<i class="fas fa-microphone"></i>).
4. **Repeat Last Response**: Use shortcut `Alt+Shift+3` or click the Redo icon (<i class="fas fa-redo"></i>).
5. **Clear Conversation**: Click the Trash icon (<i class="fas fa-trash-alt"></i>) in the header to clear the chat.

### Analyzing Web Content

-   **Capture Visible Area**: Click Camera <i class="fas fa-camera"></i>: Sends visible part of the webpage to AI.
-   **Capture Full Page**: Click Scroll <i class="fas fa-scroll"></i>: Sends the entire webpage (scrolling) to AI.
-   **Analyze Text Content**: Click File <i class="fas fa-file-lines"></i>: Sends the main text of the webpage to AI.

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