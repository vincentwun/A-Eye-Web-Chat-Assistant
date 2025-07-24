<p align="center">
    <h1 align="center">A-Eye 網頁聊天助理</h1>
</p>

<div align="center">

![Chrome](https://img.shields.io/badge/browser-Chrome-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20MacOS%20|%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

</div>

A-Eye 網頁聊天助理是一款免費且開源的 Chrome 擴充功能。它旨在透過 AI 聊天、螢幕分析與語音控制，協助視障使用者更輕鬆地瀏覽網頁。讓用家可以選擇注重隱私的本機 AI（透過 Ollama 搭配 Gemma 3），或功能強大的雲端 AI（Google Gemini 2.5）。

---
## 目錄
- [目錄](#目錄)
- [功能](#功能)
- [架構與技術](#架構與技術)
- [安裝指南](#安裝指南)
- [使用說明](#使用說明)
  - [本機 Ollama 設定：選項 1 - 手動](#本機-ollama-設定選項-1---手動)
  - [本機 Ollama 設定：選項 2 - PowerShell腳本](#本機-ollama-設定選項-2---PowerShell腳本)
  - [雲端設定：選項 1 - Google AI Studio](#雲端設定選項-1---google-ai-studio)
  - [雲端設定：選項 2 - GCP Vertex AI](#雲端設定選項-2---gcp-vertex-ai)
  - [基本互動](#基本互動)
  - [分析網頁內容](#分析網頁內容)
- [隱私權政策](#隱私權政策)
- [第三方函式庫](#第三方函式庫)
- [授權](#授權)

---
## 功能

-   **AI 螢幕分析（視覺與文字）**: 利用 Gemini/Gemma 3 即時分析螢幕截圖或完整頁面內容。
-   **全面語音控制與問答**: 透過語音操作所有功能並查詢頁面內容。
-   **可選用的 AI 模型**: 雲端 Gemini / 本機 Gemma 3，一鍵在強大的雲端 AI 與注重隱私的本機 AI（透過 Ollama）之間切換。
-   **跨平台相容性**: 適用於 Windows、macOS 和 Linux 電腦上的 Google Chrome 瀏覽器。

---
## 架構與技術

**Chrome 擴充功能與網頁 API：**

**Chrome Storage API：** 使用 `local` 儲存空間來保存使用者設定（API 金鑰、URL、提示詞、語音設定）。

**Chrome Scripting API：** 透過 Readability.js 執行內容指令碼。

**Chrome Tabs API：** 控制瀏覽器分頁，例如開啟新分頁和擷取可見分頁。

**Canvas API：** 用於合併多張螢幕截圖，以實現滾動截圖功能。

**Fetch API：** 用於向後端 API（Gemini / Ollama）發出網路請求。

**Web Speech API：**

`SpeechRecognition`：將語音轉換為文字（STT）。

`SpeechSynthesis`：將文字轉換為語音（TTS）。

**Google Cloud Platform (GCP)：**

**API Gateway：** 為雲端請求提供安全的 URL 端點。將通過驗證的請求（透過 API 金鑰）路由至 Cloud Function。

**Cloud Functions：** 接收來自 API Gateway 的請求，並呼叫 Vertex AI (Gemini) 處理資料，然後傳回回應。

**Vertex AI：** 託管 Gemini AI 模型，用於分析所提供的網頁內容（文字/圖片）。

![architecture](/images/architecture_v2.png)

---
## 安裝指南

### 在Chrome Web Store取得

https://chromewebstore.google.com/detail/a-eye-web-chat-assistant/cdjignhknhdkldbjijipaaamodpfjflp

### 手動安裝

1.  從此連結下載 ZIP 檔案：
    [https://github.com/vincentwun/A-Eye-Web-Chat-Assistant/archive/refs/heads/main.zip](https://github.com/vincentwun/A-Eye-Web-Chat-Assistant/archive/refs/heads/main.zip)
    並將其解壓縮。
2.  開啟 Chrome，前往 `chrome://extensions`，然後在右上角啟用「開發人員模式」。
3.  點擊左上角的「載入未封裝項目」，然後選取您解壓縮後的 **src** 資料夾。

---
## 使用說明

### 本機 Ollama 設定：選項 1 - 手動

1.  **安裝 [Ollama](https://ollama.com/)。**
2.  **設定 Ollama CORS 權限** (適用於 Windows 使用者)
    以系統管理員身分開啟命令提示字元 (CMD) 並執行：
    ```
    setx OLLAMA_ORIGINS "chrome-extension://*" /M
    ```
    然後執行以下指令進行驗證，輸出應為 **'chrome-extension://*'**
    ```
    echo %OLLAMA_ORIGINS%
    ```

3.  **重新啟動 Ollama**

4.  **下載並執行 Gemma 3**
    您可以參考下表來取得 Gemma 3：

   | GPU VRAM | 建議模型  | 開啟 CMD 並執行         |
   | -------- | --------- | ----------------------- |
   | >= 6GB   | Gemma 3 4B  | `ollama run gemma3:4b`  |
   | >= 10GB  | Gemma 3 12B | `ollama run gemma3:12b` |
   | >= 20GB  | Gemma 3 27B | `ollama run gemma3:27b` |

5.  在擴充功能的**設定**中，確保「本機模型名稱」為 `gemma3:4b`（或您選擇的模型）。

---
### 本機 Ollama 設定：選項 2 - 指令碼

1.  開啟 Powershell
    *   **根據需求決定使用的指令碼：**

   | 模型        | PowerShell 指令碼           |
   | ----------- | --------------------------- |
   | Gemma 3 4B  | setup_ollama_gemma3_4b.ps1  |
   | Gemma 3 12B | setup_ollama_gemma3_12b.ps1 |
   | Gemma 3 27B | setup_ollama_gemma3_27b.ps1 |

2.  執行
    ```
    powershell.exe -ExecutionPolicy Bypass -File "C:\Path\To\Your\Script\setup_ollama_gemma3_4b.ps1"
    ```
    範例：
    ```
    powershell.exe -ExecutionPolicy Bypass -File "C:\Users\test\Downloads\A-Eye-Web-Chat-Assistant-main\A-Eye-Web-Chat-Assistant-main\powershell_script\setup_ollama_gemma3_4b.ps1"
    ```

    此指令碼將協助您下載 Ollama、設定 CORS 及執行模型。

3.  在擴充功能的**設定**中，確保「Local Model Name」為 `gemma3:4b`（或您選擇的模型）。

---
### 雲端設定：選項 1 - Google AI Studio
1.  從 [Google AI Studio](https://aistudio.google.com/) 取得您的 Gemini API 金鑰。
2.  前往擴充功能的**設定**，在「Gemini API Key」欄位中輸入您的 API 金鑰。

---
### 雲端設定：選項 2 - GCP Vertex AI

關於 GCP 設定的更多詳細資訊，請參閱 [GCP README.md](gcp/gcloud/README.md)。

---
### 基本互動

1.  **開啟側邊面板**: 使用快捷鍵 `Alt+Shift+Q`。
2.  **選擇 AI 模式**: 使用快捷鍵 `Alt+Shift+1` 或點擊標題中的桌面圖示（本機）/ 雲端圖示（雲端）。
3.  **語音輸入**: 使用快捷鍵 `Alt+Shift+2` 或點擊麥克風圖示。
4.  **重複上次回應**: 使用快捷鍵 `Alt+Shift+3` 或點擊重做圖示。
5.  **清除對話**: 點擊標題中的`垃圾桶`圖示或在輸入`clear`以清除聊天記錄。

### 分析網頁內容

-   **擷取可見區域**: 點擊相機圖示，或啟用語音輸入並說出 "Take a screenshot"。
-   **擷取完整頁面**: 點擊捲動圖示，或啟用語音輸入並說出 "Take a scrolling screenshot"。
-   **分析文字內容**: 點擊文件圖示，或啟用語音輸入並說出 "Analyze content"。

---
## 隱私權政策

A-Eye 網頁聊天助理在設計時充分考量使用者隱私：

-   **不收集資料：** 本擴充功能不會收集或傳送您的個人資料或瀏覽紀錄至我們的伺服器。當使用雲端模式時，資料會直接傳送至您所設定的 AI 服務供應商。
-   **本機儲存：** 您的所有設定（包含雲端模式的 API 金鑰）皆安全地儲存在您瀏覽器的本機儲存空間中，任何網站均無法存取。
-   **本機 AI：** 當您使用本機模式（Ollama）時，所有 AI 處理程序均在您的電腦上完成，為您的資料提供最高程度的隱私保障。

---
## 第三方函式庫

本擴充功能整合了以下第三方元件：
-   **Readability.js**: 用於擷取文章的文字內容。
    -   來源: [https://github.com/mozilla/readability](https://github.com/mozilla/readability)

---
## 授權
本專案採用 MIT 授權條款。