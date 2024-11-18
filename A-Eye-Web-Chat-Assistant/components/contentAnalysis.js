export class ContentAnalysisController {
  constructor() {
    this.isProcessing = false;
  }

  async extractPageContent(tab) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['./lib/readability.js']
      });

      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          try {
            const documentClone = document.cloneNode(true);
            const reader = new Readability(documentClone);
            const article = reader.parse();

            return {
              title: article.title,
              content: article.textContent,
              byline: article.byline,
              success: true
            };
          } catch (error) {
            return {
              success: false,
              error: error.message
            };
          }
        }
      });

      if (!result.success) {
        throw new Error(`Content extraction failed: ${result.error}`);
      }

      return this.formatExtractedContent(result);
    } catch (error) {
      console.error('Content extraction error:', error);
      throw new Error('Failed to extract page content');
    }
  }

  formatExtractedContent(result) {
    return [
      result.title || 'No Title',
      result.byline || '',
      '',
      result.content || ''
    ].filter(Boolean).join('\n\n');
  }

  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async analyzeContent(callbacks) {
    if (this.isProcessing) return;

    try {
      this.isProcessing = true;
      callbacks.onStart();

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const content = await this.extractPageContent(tab);

      callbacks.onContentExtracted(content);

      const response = await chrome.runtime.sendMessage({
        type: 'analyze',
        text: content
      });

      if (!response || response.error) {
        throw new Error(response?.error || 'Analysis failed');
      }

      callbacks.onSuccess(response.content);

    } catch (error) {
      callbacks.onError(error);
    } finally {
      this.isProcessing = false;
      callbacks.onComplete();
    }
  }
}