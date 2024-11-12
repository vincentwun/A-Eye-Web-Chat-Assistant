# A-Eye Visual Assistant (Beta)

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Chrome](https://img.shields.io/badge/Chrome--Dev%2FCanary-v128.0.6545.0%2B-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20MacOS%20|%20Linux-lightgrey)
![Status](https://img.shields.io/badge/status-beta-orange)

An advanced Chrome extension leveraging Web AI and Gemini Nano for real-time image description with privacy-first approach.

> ⚠️ **Important**: This extension requires Chrome Dev or Canary channel (≥ 128.0.6545.0) to function properly.

</div>

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Technical Details](#technical-details)
- [Limitations](#limitations)
- [License](#license)

## Overview
A-Eye Visual Assistant is a specialized Chrome extension designed to enhance web accessibility for visually impaired users. By integrating advanced AI chat capabilities with traditional screen reader functions, users can naturally converse with web content and receive comprehensive page interpretations. Powered by Chrome's built-in Gemini Nano, it provides secure on-device processing for real-time image descriptions and content analysis. Currently in beta development with regular updates.

## Key Features

| Feature | Description |
|---------|-------------|
| Privacy-First | All processing happens locally on your device |
| Real-Time Performance | Instant image analysis and description |
| Dual AI Models | Leveraging both Gemini Nano and Moondream2 |
| Cross-Platform | Supports Windows, macOS, and Linux |

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
   https://github.com/vincentwun/A-Eye-Visual-Assistant-Beta/archive/refs/heads/main.zip
   ```

2. Chrome Configuration
   - Launch Chrome browser
   - Navigate to `chrome://extensions`
   - Enable "Developer mode" (top-right corner)
   - Select "Load unpacked"
   - Navigate to extracted extension directory
   - Select `A-Eye Visual Assistant (Beta)` directory

### Required Configuration

#### Chrome Flags Setup

| Category | Flag | Setting |
|----------|------|---------|
| WebGPU | `chrome://flags/#enable-webgpu-developer-features` | Enabled |
| Gemini Nano | `chrome://flags/#optimization-guide-on-device-model` | Enabled BypassPerfRequirement |
| Prompt API | `chrome://flags/#prompt-api-for-gemini-nano` | Enabled |

Note: Restart Chrome after modifying these flags.

#### Gemini Nano Setup

1. **Model Initialization**
   - Visit [Prompt API Playground](https://chrome.dev/web-ai-demos/prompt-api-playground/) to trigger the `Optimization Guide On Device Model` in `chrome://components`.
   - Open the DevTools Console (F12).
   - Execute:
     ```javascript
     await ai.languageModel.create();
     ```
   - Ensure the return value is `"after-download"` before proceeding.

2. **Component Verification**
   - Go to `chrome://components`.
   - Verify that the `Optimization Guide On Device Model` version is ≥ 2024.5.21.1031.
   - If outdated, click "Check for update."

3. **Availability Check**
   - Open the DevTools Console (F12).
   - Execute:
     ```javascript
     (await ai.languageModel.capabilities()).available;
     ```
   - Confirm the return value is `"readily"`.


## Technical Architecture

### Component Structure
[Update Soon]

### Technology Stack
[Update Soon]

## Current Limitations

| Limitation | Description |
|------------|-------------|
| Language Support | English only |
| Chrome Version | Requires Dev/Canary Channel |
| Hardware Requirements | Significant storage space needed |
| Model Updates | Regular downloads required |

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for full details.