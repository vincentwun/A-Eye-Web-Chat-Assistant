# Web AI Screen Reader (Beta)

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Chrome](https://img.shields.io/badge/Chrome-v128.0.6545.0+-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20MacOS%20|%20Linux-lightgrey)
![Status](https://img.shields.io/badge/status-beta-orange)

An advanced Chrome extension leveraging Web AI and Gemini Nano for real-time image description with privacy-first approach.

</div>

## 📑 Table of Contents
- [Overview](#overview)
- [Key Advantages](#key-advantages)
- [System Requirements](#system-requirements)
- [Installation Guide](#installation-guide)
- [Technical Architecture](#technical-architecture)
- [Usage Guide](#usage-guide)
- [License](#license)

## 🎯 Overview
Web AI Screen Reader is a cutting-edge Chrome extension that integrates advanced AI technologies to provide real-time image descriptions and web content analysis. Powered by Chrome's built-in Gemini Nano, it ensures secure on-device processing for enhanced privacy protection.

## ✨ Key Advantages
- 🔒 **Privacy-First**: All processing happens locally on your device
- ⚡ **Real-Time Performance**: Instant image analysis and description
- 🤖 **Dual AI Models**: Leveraging both Gemini Nano and Moondream2
- 💻 **Cross-Platform**: Supports Windows, macOS, and Linux

## ⚙️ System Requirements

### Hardware Requirements
- **CPU:** Multi-core processor (Intel/AMD)
- **GPU:** Integrated GPU or discrete GPU
- **VRAM:** Minimum 4GB
- **Storage:** 24GB free space
  - 22GB for Gemini Nano model
  - 2GB for Moondream2 model
  - Additional space for cache and temporary files

### Software Requirements
| Operating System | Version |
|-----------------|---------|
| Windows | 10 or later |
| macOS | 13 (Ventura) or later |
| Linux | Modern distribution with WebGPU support |

### Browser Requirements
- Google Chrome Dev/Canary Channel (Version ≥ 128.0.6545.0)
- WebGPU-enabled configuration

## 📦 Installation Guide

### Step 1: Extension Download
```bash
# Clone the repository
git clone https://github.com/vincentwun/Web-AI-Screen-Reader-Beta.git

# Or download directly
wget https://github.com/vincentwun/Web-AI-Screen-Reader-Beta/archive/refs/heads/main.zip
```

### Step 2: Chrome Configuration
1. **Enable Developer Mode**
   - Open Chrome browser
   - Navigate to `chrome://extensions`
   - Toggle "Developer mode" in the top-right corner

2. **Load Extension**
   - Click "Load unpacked"
   - Select the `Web-AI-Screen-Reader-Beta` folder
   - Verify successful installation

### Step 3: Required Flags Configuration

#### WebGPU Setup
```
chrome://flags/#enable-webgpu-developer-features → Enabled
```

#### Gemini Nano Configuration
```
chrome://flags/#optimization-guide-on-device-model → Enabled BypassPerfRequirement
chrome://flags/#prompt-api-for-gemini-nano → Enabled
```

### Step 4: Activate Gemini Nano
1. Visit the [Prompt API Playground](https://chrome.dev/web-ai-demos/prompt-api-playground/)
2. Open Developer Console (F12)
3. Execute:
   ```javascript
   await ai.languageModel.create();
   ```
4. Update components at `chrome://components`

## 🔧 Technical Architecture
```
Web AI Screen Reader
├── Core Components
│   ├── Image Processing Engine
│   ├── Gemini Nano Integration
│   └── WebGPU Accelerator
├── Processing Pipeline
│   ├── Image Capture
│   ├── AI Analysis
│   └── Description Generation
└── User Interface
    ├── Control Panel
    └── Output Display
```

## 📘 Usage Guide
[Coming Soon]

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.