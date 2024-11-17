# A-Eye Web Chat Assistant

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Chrome](https://img.shields.io/badge/Chrome--Dev%2FCanary-v128.0.6545.0%2B-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20MacOS%20|%20Linux-lightgrey)
![Status](https://img.shields.io/badge/status-beta-orange)



> ⚠️ **Important**: This extension requires Chrome Dev or Canary channel (≥ 128.0.6545.0) to function properly.

</div>

An advanced Chrome extension leveraging WebAI and Gemini Nano for real-time web voice chat with privacy-first approach for visually impaired or handicap.

## Table of Contents
- [Overview](#overview)
- [Technical Architecture](#technical-architecture)
- [Key Features](#key-features)
- [Requirements](#requirements)
- [Installation](#installation)
- [How to Use](#how-to-use)
- [Limitations](#limitations)
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
| Operating System | Windows 10+, macOS 13+, or Linux with WebGPU support |
| CPU | Multi-core processor (Intel/AMD) |
| GPU/VRAM | Integrated/Discrete GPU with 4GB+ VRAM |
| Storage | 24GB free space (22GB Gemini Nano, 2GB Moondream2) |

## Installation

### Browser Setup
- Download [Chrome Dev](https://www.google.com/chrome/dev/) or [Chrome Canary](https://www.google.com/chrome/canary/)
- Verify version ≥ 128.0.6545.0 at `chrome://settings/help`

### Extension Setup

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
   - Select `A-Eye-Web-Chat-Assistant` directory

### Required Configuration

#### Chrome Flags Setup

| Category | Flag | Setting |
|----------|------|---------|
| WebGPU | `chrome://flags/#enable-webgpu-developer-features` | Enabled |
| Gemini Nano | `chrome://flags/#optimization-guide-on-device-model` | Enabled BypassPerfRequirement |
| Prompt API | `chrome://flags/#prompt-api-for-gemini-nano` | Enabled |

**Important:**  
After modifying the flags above, **please restart Chrome** to apply the changes. Failure to do so may result in the settings not being properly activated.

#### Gemini Nano Setup

1. **Model Initialization**
   - Navigate to the [Prompt API Playground](https://chrome.dev/web-ai-demos/prompt-api-playground/).
   - Open the DevTools Console (F12).
   - Execute:
     ```javascript
     (await ai.languageModel.capabilities()).available;
     ```
   - The return value should be `"after-download"`.
> **Reminder:** This step triggers the `Optimization Guide On Device Model` to appear in `chrome://components`. Ensure that this component is visible for the next steps.

2. **Component Verification**
   - Go to `chrome://components`.
   - Verify that the `Optimization Guide On Device Model` version is ≥ 2024.5.21.1031.
   - If outdated, click "Check for update." (This may take some time to download).

3. **Availability Check**
   - Open the DevTools Console (F12).
   - Execute:
     ```javascript
     (await ai.languageModel.capabilities()).available;
     ```
   - Confirm the return value is `"readily"`.

## How to Use

### Keyboard Shortcuts
- **Alt + Shift + 1**: Open A-Eye Web Chat Assistant Extension.
- **Alt + Shift + 1**: Activate voice control for browser and extension operations.  
- **Alt + Shift + 2**: Interact with the AI for additional information after executing specific commands.  
  *(Example: After using **Take Screenshot**, **Take Rolling Screenshot**, or **Analyze Content**, press **Alt + Shift + 2** to chat with the AI for further insights.)*

### Voice Commands  
Use the following voice commands to perform various tasks:

#### 1. **Search**  
- **Command**: `"Search [query]"`  
  - **Example**: `"Search the weather today"`  
  - **Action**: Opens a Google search for the specified query.

#### 2. **Navigate to a Website**  
- **Command**: `"Go to [website]"`  
  - **Example**: `"Go to google.com"`  
  - **Action**: Opens the specified website.  
    *(Note: The `.com` suffix is optional.)*

#### 3. **Take Screenshot**  
- **Commands**:  
  - `"Take screenshot"`  
  - `"Take a screenshot"`  
  - `"Capture screen"`  
  - **Action**: Captures a screenshot of the current view. The AI provides a description of the image.

#### 4. **Take Rolling Screenshot**  
- **Commands**:  
  - `"Take rolling screenshot"`  
  - `"Rolling screenshot"`  
  - **Action**: Captures a scrolling screenshot. The AI provides a description of the image.

#### 5. **Analyze Content**  
- **Commands**:  
  - `"Analyze content"`  
  - `"Analyze page"`  
  - `"Content analysis"`  
  - **Action**: Performs content analysis on the current page using **Gemini Nano**.

> Reminder: Please grant microphone access to the extension to use the voice features.

These shortcuts allow you to seamlessly navigate and interact with web content using voice commands.

## Current Limitations

| Limitation | Description |
|------------|-------------|
| Language Support | English only |
| Chrome Version | Requires Dev/Canary Channel |
| Hardware Requirements | Significant storage space needed |

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for full details.
