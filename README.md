# Web AI Screen Reader (Beta)

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Chrome](https://img.shields.io/badge/Chrome-v128.0.6545.0+-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20MacOS%20|%20Linux-lightgrey)
![Status](https://img.shields.io/badge/status-beta-orange)

An advanced Chrome extension leveraging Web AI and Gemini Nano for real-time image description with privacy-first approach.

</div>

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [System Requirements](#system-requirements)
- [Installation](#installation)
- [Technical Architecture](#technical-architecture)
- [Usage](#usage)
- [Current Limitations](#current-limitations)
- [License](#license)

## Overview
Web AI Screen Reader is a cutting-edge Chrome extension that integrates advanced AI technologies to provide real-time image descriptions and web content analysis. Powered by Chrome's built-in Gemini Nano, it ensures secure on-device processing for enhanced privacy protection.

## Key Features

| Feature | Description |
|---------|-------------|
| Privacy-First | All processing happens locally on your device |
| Real-Time Performance | Instant image analysis and description |
| Dual AI Models | Leveraging both Gemini Nano and Moondream2 |
| Cross-Platform | Supports Windows, macOS, and Linux |

## System Requirements

### Hardware Specifications

| Component | Minimum Requirement |
|-----------|-------------------|
| GPU | Integrated GPU or discrete GPU |
| VRAM | 4GB minimum |
| Storage | 24GB free space |

### Storage Allocation

| Component | Space Required |
|-----------|---------------|
| Gemini Nano | 22GB |
| Moondream2 | 2GB |
| Cache & Temp Files | Additional space required |

### Software Specifications

| Component | Requirement |
|-----------|------------|
| Windows | Version 10 or later |
| macOS | Version 13 (Ventura) or later |
| Linux | Modern distribution with WebGPU support |
| Chrome | Dev/Canary Channel (≥ 128.0.6545.0) |
| WebGPU | Enabled configuration required |

## Installation

### 0. Full Installation Video Guide (Coming Soon)

### 1. Download Extension

```
https://github.com/vincentwun/Web-AI-Screen-Reader-Beta/archive/refs/heads/main.zip
```

### 2. Chrome Configuration

1. Enable Developer Mode
   - Launch Chrome browser
   - Navigate to `chrome://extensions`
   - Enable "Developer mode" (top-right corner)

2. Load Extension
   - Select "Load unpacked"
   - Navigate to `Web-AI-Screen-Reader-Beta` directory
   - Confirm successful installation

### 3. Required Flags Setup

#### WebGPU Configuration
| Flag | Setting |
|------|---------|
| `chrome://flags/#enable-webgpu-developer-features` | Enabled |

#### Gemini Nano Configuration
| Flag | Setting |
|------|---------|
| `chrome://flags/#optimization-guide-on-device-model` | Enabled BypassPerfRequirement |
| `chrome://flags/#prompt-api-for-gemini-nano` | Enabled |

Note: Restart Chrome after modifying these flags for changes to take effect.

### 4. Gemini Nano Activation

1. Access [Prompt API Playground](https://chrome.dev/web-ai-demos/prompt-api-playground/)
2. Launch Developer Console (F12)
3. Execute initialization:
   ```javascript
   await ai.languageModel.create();
   ```
4. Open a new tab in Chrome, go to `chrome://components`
5. Confirm that Gemini Nano is either available or is being downloaded
   - You'll want to see the Optimization Guide On Device Model present with a version greater or equal to 2024.5.21.1031.
   - If there is no version listed, click on Check for update to force the download.

## Technical Architecture

### Core Components
[Update soon]

### Technology Stack
[Update soon]

## Usage
[Update soon]

## Current Limitations
Only supports English language for image description and web content analysis.

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for full details.