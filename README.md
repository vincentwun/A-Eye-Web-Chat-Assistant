# A-Eye Visual Assistant (Beta)

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Chrome](https://img.shields.io/badge/Chrome--Dev%2FCanary-v128.0.6545.0%2B-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20MacOS%20|%20Linux-lightgrey)
![Status](https://img.shields.io/badge/status-beta-orange)

A next-generation Chrome extension powered by Web AI and Gemini Nano, delivering on-device real-time image description capabilities with enterprise-grade privacy.

> ⚠️ **Critical Requirement**: This extension exclusively supports Chrome Dev/Canary channel (≥ 128.0.6545.0).

</div>

## Table of Contents
- [Overview](#overview)
- [Core Features](#core-features)
- [System Requirements](#system-requirements)
- [Setup Guide](#setup-guide)
- [Architecture](#architecture)
- [Known Limitations](#known-limitations)
- [License](#license)

## Overview
A-Eye Visual Assistant represents a breakthrough in web accessibility technology, specifically engineered for vision-impaired users. It seamlessly integrates state-of-the-art AI conversational capabilities with enhanced screen reader functionality, enabling natural interaction with web content through intelligent page interpretation. Built on Chrome's native Gemini Nano framework, it ensures enterprise-grade security through complete on-device processing for real-time image analysis and content comprehension.

## Core Features

| Feature | Implementation Details |
|---------|----------------------|
| Enterprise Privacy | Dedicated on-device processing architecture ensures zero data transmission |
| High-Performance Engine | Optimized algorithms delivering sub-second image analysis response |
| Dual AI Architecture | Strategic integration of Gemini Nano and Moondream2 technologies |
| Universal Compatibility | Full support across Windows, macOS, and Linux environments |

## System Requirements

### Hardware & Software Specifications

| Component | Specification Requirements |
|-----------|--------------------------|
| Browser Environment | Chrome Dev/Canary (≥ 128.0.6545.0) **MANDATORY** |
| Operating System | Windows 10+, macOS 13+, or WebGPU-enabled Linux |
| Processor | Modern multi-core architecture (Intel/AMD) |
| Graphics Processing | Dedicated/Integrated GPU with minimum 4GB VRAM |
| Storage Capacity | 24GB available space (Gemini Nano: 22GB, Moondream2: 2GB) |

## Setup Guide

### Browser Installation
1. Install [Chrome Dev](https://www.google.com/chrome/dev/) or [Chrome Canary](https://www.google.com/chrome/canary/)
2. Validate installation version (≥ 128.0.6545.0) via `chrome://settings/help`

### Extension Deployment

1. Source Acquisition
   ```
   https://github.com/vincentwun/A-Eye-Visual-Assistant-Beta/archive/refs/heads/main.zip
   ```

2. Extension Configuration
   - Initialize Chrome browser
   - Access `chrome://extensions`
   - Activate "Developer mode"
   - Select "Load unpacked"
   - Locate extracted extension files
   - Choose `A-Eye Visual Assistant (Beta)` directory

### Advanced Configuration

#### Chrome Flag Configuration

| Category | Configuration Path | Required State |
|----------|-------------------|----------------|
| WebGPU Support | `chrome://flags/#enable-webgpu-developer-features` | Enabled |
| Gemini Nano Core | `chrome://flags/#optimization-guide-on-device-model` | Enabled BypassPerfRequirement |
| Prompt Integration | `chrome://flags/#prompt-api-for-gemini-nano` | Enabled |

Important: Browser restart required post-configuration.

#### Gemini Nano Initialization

1. Model Activation
   - Access [Prompt API Playground](https://chrome.dev/web-ai-demos/prompt-api-playground/)
   - Launch DevTools Console (F12)
   - Execute initialization:
     ```javascript
     await ai.languageModel.create();
     ```
   - Verify "after-download" status before proceeding

2. Component Status Verification
   - Navigate to `chrome://components`
   - Confirm `Optimization Guide On Device Model` version ≥ 2024.5.21.1031
   - Execute update if necessary

3. System Readiness Validation
   - Access DevTools Console (F12)
   - Execute availability check:
     ```javascript
     (await ai.languageModel.capabilities()).available;
     ```
   - Confirm "readily" status

## Architecture

### Component Architecture
[Documentation Pending]

### Technical Stack
[Documentation Pending]

## Known Limitations

| Constraint Category | Technical Details |
|--------------------|-------------------|
| Language Processing | English language exclusivity |
| Browser Compatibility | Dev/Canary Channel requirement |
| System Resources | Substantial storage allocation required |
| Model Management | Periodic model updates necessary |

## License
Released under MIT License. Reference [LICENSE](LICENSE) for comprehensive terms.