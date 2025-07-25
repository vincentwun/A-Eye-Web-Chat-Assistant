<p align="center">
    <img src="src/icons/icon-128.png" alt="A-Eye Logo" width="128">
    <h1 align="center">A-Eye 網頁聊天助理</h1>
</p>

<p align="center">
    <strong>您的人工智慧夥伴，為您打造無障礙的網路體驗。</strong>
</p>

<div align="center">

![Chrome Web Store](https://img.shields.io/chrome-web-store/v/cdjignhknhdkldbjijipaaamodpfjflp?style=for-the-badge)
![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/cdjignhknhdkldbjijipaaamodpfjflp?style=for-the-badge)
![License](https://img.shields.io/github/license/vincentwun/A-Eye-Web-Chat-Assistant?style=for-the-badge)

</div>

<p align="center">
    <a href="./README.md"><strong>Read in English</strong></a>
</p>

---

A-Eye 是一款免費、開源的 Chrome 擴充功能，旨在讓網頁瀏覽變得更輕鬆、更無障礙，尤其適合視障使用者。透過直觀的 AI 聊天、強大的螢幕分析以及全面的語音控制，它將徹底改變您與網路互動的方式。您可以自由選擇注重隱私的本地 AI（透過 Ollama 運行）或功能強大的雲端 Gemini 2.5 Pro。

## 主要功能

-   **AI 螢幕分析**：透過分析螢幕截圖或網頁全文，即時理解頁面內容，支援 Gemini 及本地大型語言模型。
-   **全面語音控制**：使用您的聲音來導航、提問並控制瀏覽器。
-   **雙 AI 模式**：只需一鍵，即可在強大的雲端 AI（Google Gemini）與保障隱私的本地 AI（Ollama）之間輕鬆切換。
-   **網頁互動**：直接告訴 AI，讓它幫您點擊按鈕或輸入文字（例如：「點擊登入按鈕」、「在搜尋欄輸入『你好世界』」）。
-   **跨平台支援**：完美運行於安裝了 Google Chrome 的 Windows、macOS 及 Linux 電腦。

## 開始使用

-   **安裝擴充功能**
    *   **推薦方式**：由 [Chrome 線上應用程式商店](https://chromewebstore.google.com/detail/a-eye-web-chat-assistant/cdjignhknhdkldbjijipaaamodpfjflp)安裝。
    *   **手動安裝**：下載程式碼，在 Chrome 前往 `chrome://extensions`，啟用右上角的「開發人員模式」，然後點擊「載入未封裝項目」，並選取解壓縮後的 `src` 資料夾。

## 模型設定：配置您的 AI

您必須設定至少一種 AI 模式，才能啟用本擴充功能。

### 本地 AI 設定 (Ollama & Gemma 3)

最適合注重隱私的使用者，所有運算皆在您自己的電腦上完成。

<details>
<summary><strong>點擊此處展開本地 AI 設定說明</strong></summary>

#### 選項一：自動化 PowerShell 指令碼 (Windows)
此為 Windows 使用者最簡單直接的方法。

1.  根據您顯示卡的 VRAM 選擇合適的指令碼：
    *   **>= 6GB VRAM**: `setup_ollama_gemma3_4b.ps1`
    *   **>= 10GB VRAM**: `setup_ollama_gemma3_12b.ps1`
    *   **>= 20GB VRAM**: `setup_ollama_gemma3_27b.ps1`
2.  開啟 PowerShell 並執行指令碼（請將路徑替換為您的檔案實際路徑）：
    ```powershell
    powershell.exe -ExecutionPolicy Bypass -File "C:\您的指令碼路徑\setup_ollama_gemma3_4b.ps1"
    ```
3.  指令碼將會自動安裝 Ollama、設定權限，並下載您選擇的模型。
4.  在擴充功能的 **設定** 頁面，確保「本地模型名稱」與您所安裝的模型一致（例如 `gemma3:4b`）。

#### 選項二：手動設定
1.  **安裝 [Ollama](https://ollama.com/)**。
2.  **設定 CORS 權限**：此步驟是為了讓擴充功能與 Ollama 通訊。
    *   **Windows**: 以系統管理員身分開啟 CMD，然後執行 `setx OLLAMA_ORIGINS "chrome-extension://*" /M`。
    *   **macOS/Linux**: 請參考 Ollama 的官方文件，設定 `OLLAMA_ORIGINS` 環境變數。
3.  **重新啟動 Ollama**，使新設定生效。
4.  **下載模型**：開啟您的終端機/CMD，根據您顯示卡的 VRAM 執行相應指令：
    *   **>= 6GB VRAM**: `ollama run gemma3:4b`
    *   **>= 10GB VRAM**: `ollama run gemma3:12b`
    *   **>= 20GB VRAM**: `ollama run gemma3:27b`
5.  在擴充功能的 **設定** 頁面，確保「本地模型名稱」與您所安裝的模型一致。

</details>

### 雲端 AI 設定 (Google Gemini)

追求極致效能與表現的最佳選擇。

<details>
<summary><strong>點擊此處展開雲端 AI 設定說明</strong></summary>

#### 選項一：Google AI Studio (最簡單)
1.  前往 [Google AI Studio](https://aistudio.google.com/)。
2.  點擊 `Get API Key` > `Create API Key`。
3.  複製您的 API 金鑰。
4.  在擴充功能的 **設定** 頁面，將其貼上至「雲端 API 金鑰」欄位。

#### 選項二：Google Cloud Platform (Vertex AI)
適合想自行管理 GCP 基礎設施的進階使用者。詳細步驟請參閱 [GCP 設定指南](./gcp/gcloud/README.md)。

</details>

## 指令與快捷鍵

| 操作 | 快捷鍵 | 語音指令範例 |
| :--- | :--- | :--- |
| 開啟側邊面板 | `Alt+Shift+Q` | - |
| 切換 AI 模式 | `Alt+Shift+1` | - |
| 開關語音輸入 | `Alt+Shift+2` | - |
| 重複上次回應 | `Alt+Shift+3` | - |
| 擷取可見範圍 | - | "Take a screenshot" |
| 擷取整個網頁 | - | "Take a scrolling screenshot" |
| 分析網頁文字 | - | "Analyze content" |
| 清除對話 | - | "Clear" |

## 技術架構

<details>
<summary><strong>點擊此處展開技術細節</strong></summary>

#### Chrome 擴充功能與 Web API
*   **Scripting API**: 用於在網頁環境下執行內容指令碼（例如 Readability.js）。
*   **Side Panel API**: 用於建構主要的使用者介面。
*   **Canvas API**: 用於將多張截圖合成為一張「捲動截圖」。
*   **Web Speech API**: 同時用於 `SpeechRecognition`（語音轉文字）及 `SpeechSynthesis`（文字轉語音）。

#### 後端與 AI
*   **本地模式**: 直接與本機的 [Ollama](https://ollama.com/) 實例通訊。
*   **雲端模式**: 使用一個安全的 Google Cloud Platform 無伺服器後端。
    *   **API Gateway**: 提供安全的 API 端點，並驗證 API 金鑰。
    *   **Cloud Functions**: 接收請求並呼叫 AI 模型的無伺服器函數。
    *   **Vertex AI**: 託管強大的 Gemini 模型以進行分析。

![architecture](images/architecture_v2.png)

</details>

## 隱私保障

A-Eye 將保障使用者隱私置於首位：
-   **不收集資料**：本擴充功能不會收集或傳送任何個人資料或瀏覽紀錄至我們的伺服器。
-   **安全儲存**：您的設定與 API 金鑰僅會儲存於您瀏覽器的本機儲存空間，網站無法存取。
-   **本地 AI 選項**：當您使用本地模式時，所有資料與 AI 運算皆完全在您自己的電腦上進行，絕不會傳送至雲端。

## 第三方函式庫

-   **Readability.js**: 用於擷取文章內容。源碼：[mozilla/readability](https://github.com/mozilla/readability)。

## 授權條款

本專案採用 [MIT 授權條款](./LICENSE) 授權。