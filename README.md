# A-Eye Web Chat Assistant

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Chrome](https://img.shields.io/badge/Chrome--Dev%2FCanary-v128.0.6545.0%2B-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20MacOS%20|%20Linux-lightgrey)
![Status](https://img.shields.io/badge/status-beta-orange)



> ⚠️ **Important**: This extension requires Chrome Dev or Canary channel (≥ 128.0.6545.0) to function properly.

</div>

An advanced Chrome extension leveraging Web AI and Chrome's built-in AI (Gemini Nano) for real-time web voice chat with privacy-first approach for visually impaired or handicap.

## Table of Contents
- [Overview](#overview)
- [Technical Architecture](#technical-architecture)
- [Key Features](#key-features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Browser Required Configuration](#browser-required-configuration)
- [How to Use](#how-to-use)
- [Current Limitations](#current-limitations)
- [License](#license)

## Overview
A-Eye Web Chat Assistant is a specialized Chrome extension designed to enhance web accessibility for visually impaired users. By integrating advanced AI chat capabilities with traditional screen reader functions, users can naturally converse with web content and receive comprehensive page interpretations. Powered by Chrome's built-in Gemini Nano, it provides secure on-device processing for real-time image descriptions and content analysis. Currently in beta development with regular updates, this extension is completely free and is an open-source project.


## Technical Architecture

This Chrome extension is built on a modular architecture featuring advanced technologies to deliver a professional and accessible experience. It integrates:

### AI Model Integration
- **Moondream2**: Accelerates image recognition and description with WebGPU, optimizing performance through FP16 and Q4 quantization.
- **Gemini Nano**: Enables lightweight and secure text analysis and summarization with on-device AI.
- **Transformers.js**: Provides seamless browser-based AI inference.

### Voice Interaction System
- Combines Web Speech API technologies for real-time voice recognition and dynamic text-to-speech synthesis, offering multi-language support and customization.

### Key Technical Features
- **Performance Optimization**: Utilizes WebGPU for efficient AI acceleration and asynchronous operations for a smooth user experience.
- **Accessibility-Driven Design**: Integrates intelligent voice control, audio descriptions, and web content summarization for enhanced usability.

![architecture](/images/architecture.png)

## Key Features

- **Privacy-First**: Ensures all processing is done locally on your device, safeguarding your data with AI on Chrome and WebAI.
- **Voice Interaction**: Allows users to control the screen reader with voice commands using the Web Speech API.
- **Real-Time Image Descriptions**: Provides real-time descriptions of images through WebAI and HuggingFace.js.
- **Comprehensive Content Chat**: Offers detailed interpretations of web pages and image descriptions using Chrome’s built-in prompt API.
- **Speech Synthesis**: Reads out responses using advanced speech synthesis technology via the Web Speech API.
- **Conversation Management**: Keeps track of conversation history and state for seamless interactions.
- **Dual AI Models**: Utilizes both Gemini Nano and Moondream2 for superior accuracy.
- **Cross-Platform Compatibility**: Available on Windows, macOS, and Linux.
- **Chrome Extension**: Easily accessible as a Chrome extension.

## Requirements

### System Requirements

| Component | Minimum Requirement |
|-----------|-------------------|
| Browser | Chrome Dev/Canary (≥ 128.0.6545.0) **REQUIRED** |
| Operating System | Windows 10+, macOS 13+, or Linux |
| CPU | Multi-core processor (Intel/AMD) |
| GPU/VRAM | GPU with 6GB+ VRAM (integrated or discrete) that must support FP16 (half-precision floating point) |
| Storage | 24GB free space (22GB Gemini Nano, 2GB Moondream2) |

---

## Installation

### Get Chrome Dev or Chrome Canary Browser
- Download [Chrome Dev](https://www.google.com/chrome/dev/) or [Chrome Canary](https://www.google.com/chrome/canary/)
- Verify version ≥ 128.0.6545.0 at `chrome://settings/help`

### Get Extension from GitHub

1. Download Extension
   ```
   https://github.com/vincentwun/A-Eye-Web-Chat-Assistant/archive/refs/heads/main.zip
   ```

2. Chrome Configuration
   - Launch Chrome browser
   - Navigate to `chrome://extensions`
   - Enable "Developer mode" (top-right corner)
   - Select "Load unpacked"
   - Navigate to extracted extension directory
   - Select `A-Eye-Web-Chat-Assistant-main/A-Eye-Web-Chat-Assistant` directory

### Alternatively: Get Extension from Chrome Web Store
```
https://chromewebstore.google.com/detail/a-eye-web-chat-assistant/cdjignhknhdkldbjijipaaamodpfjflp
```

---

## Browser Required Configuration

### Chrome Flags Setup

| Category | Flag | Setting |
|----------|------|---------|
| WebGPU | `chrome://flags/#enable-webgpu-developer-features` | Enabled |
| Gemini Nano | `chrome://flags/#optimization-guide-on-device-model` | Enabled BypassPerfRequirement |
| Prompt API | `chrome://flags/#prompt-api-for-gemini-nano` | Enabled |
| Text Classifier | `chrome://flags/#text-safety-classifier` | Disabled |

**Important:**  
After modifying the flags above, **Please Restart Chrome** to apply the changes!!!

### Built-in AI Model (Gemini Nano) Setup

1. To trigger the Gemini Nano download, open the [Prompt API Playground](https://chrome.dev/web-ai-demos/prompt-api-playground/)  
```
https://chrome.dev/web-ai-demos/prompt-api-playground/
```
2. Launch the **DevTools Console** (`F12`).
3. Execute:  
   ```javascript
   (await ai.languageModel.capabilities()).available;
   ```
- Manually type "allow pasting" if prompted.
  
4. Check the return value from the command:  
- If the return value is `"no"`, proceed to Step 5.
- If the return value is `"after-download"`, skip to Step 6.

5. In **DevTools Console**, run:  
     ```javascript
     await ai.languageModel.create();
     ```  
   - Note: This command may fail, which is expected.
   - Relaunch Chrome and reopen the DevTools Console and execute: 
     ```javascript
     (await ai.languageModel.capabilities()).available;
     ```
   - The return value should now be `"after-download"`. Proceed to Step 6.

6. Go to ```chrome://components```
- Locate **Optimization Guide On Device Model**
- Click **"Check for update"** to download the latest version.
- (Note: Download times may vary depending on your network speed.)

### Web AI Model (Moondream2) Setup

**Initialization Process**
1. Press `Alt + Shift + Q` to open the **A-Eye Web Chat Assistant**.  
2. During the first run, the Web AI model will automatically download from the **Hugging Face Hub**.  
3. Once the initialization is complete:  
   - A message **"Model initialization complete"** will appear at the top of the screen.  
   - The system will announce the message using **text-to-speech (TTS)**.

---

## How to Use

### Prerequisite
- Ensure microphone access is granted to the extension to utilize voice features.

### Keyboard Shortcuts
#### 1. Open the A-Eye Web Chat Assistant
- **Shortcut**: `Alt + Shift + Q`  

#### 2. Activate Voice Control
- **Shortcut**: `Alt + Shift + 1`  
- Enables voice control for browser and extension operations.  
- **Available Voice Commands**:  
  - **Search**  
    - Command: `"Search [query]"`  
    - Example: `"Search the weather today"`  
    - Action: Opens a Google search for the specified query.  

  - **Navigate to a Website**  
    - Command: `"Go to [website]"`  
    - Example: `"Go to google.com"`  
    - Action: Opens the specified website. *(Currently, only .com websites are supported.)*

  - **Take Screenshot**  
    - Commands: `"Take a screenshot"`
    - Action: Captures a screenshot of the current view and provides an AI-generated description.  

  - **Take Scrolling Screenshot**
    - Commands: `"Take a scrolling screenshot"`
    - Action: Captures a scrolling screenshot and provides an AI-generated description.  

  - **Analyze Content**
    - Commands: `"Analyze content"`
    - Action: Performs content analysis of the current page using **Gemini Nano**.

#### 3. Interact with the AI After Actions
- **Shortcut**: `Alt + Shift + 2`  
- Use this after executing **Screenshot**, **Scrolling Screenshot**, or **Analyze Content** to chat with the AI for additional insights.

#### 4. Repeat the AI's Last Response
- **Shortcut**: `Alt + Shift + 3`  



These shortcuts allow you to seamlessly navigate and interact with web content using voice commands.

## Current Limitations

| Limitation | Description |
|------------|-------------|
| Language Support | English only |
| Chrome Version | Requires Dev/Canary Channel |
| Hardware Requirements | Significant storage space needed |

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for full details.
