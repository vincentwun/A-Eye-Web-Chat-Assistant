# Web AI Screen Reader 2.0

Experience the power of AI-enhanced web browsing with Web AI Screen Reader 2.0. This Chrome extension leverages Chrome's built-in Gemini Nano API to provide real-time image descriptions and translations, making web content more accessible.

![Web AI Screen Reader Logo](updatelater)

## Features
- Real-time image description using Web AI
- Multi-language support with Chrome's Translation API
- Automatic language detection
- On-device processing for enhanced privacy

## Architecture

### Frontend
[Update soon...]

![Architecture Diagram](updatelater)

## Installation Guide

### Prerequisites
- Google Chrome (Developer Version) recommended for full Gemini Nano API support
- Minimum 4GB RAM
- Minimum 22GB storage space
- Discrete GPU (recommended, NOT necessary)

### Step 1: Enable Developer Mode
1. Open Google Chrome browser
2. Click the menu icon (⋮) > Extensions
3. Enable "Developer mode" in the top-right corner

### Step 2: Load Extension
1. Click "Load unpacked"
2. Navigate to and select the `ai_screen_reader_2.0` folder
3. Click "Select Folder"

### Step 3: Required Chrome Flags Configuration

#### Enable WebGPU
1. Navigate to `chrome://flags/#enable-webgpu-developer-features`
2. Set to "Enabled"

#### Configure Gemini Nano API
1. Navigate to `chrome://flags/#optimization-guide-on-device-model`
2. Select "Enabled BypassPerfRequirement"
3. Navigate to `chrome://flags/#prompt-api-for-gemini-nano`
4. Select "Enabled"
5. Go to `chrome://components`
6. Find "Optimization Guide On Device Model"
7. Click "Check for update"

#### Enable Language Detection
1. Navigate to `chrome://flags/#language-detection-api`
2. Select "Enabled"

#### Enable Translation
1. Navigate to `chrome://flags/#translation-api`
2. Select "Enabled"
3. Visit `chrome://on-device-translation-internals/` to manage language packages

### Step 4: Verify Installation
1. Look for the extension icon in your Chrome toolbar
2. Click the icon to ensure it's working properly

## Current Limitations
[Update soon...]