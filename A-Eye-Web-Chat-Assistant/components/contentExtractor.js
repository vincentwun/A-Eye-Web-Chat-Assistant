export class ContentExtractor {

  static async extractPageContent(tab) {
    if (!tab || !tab.id) {
      throw new Error("Invalid tab provided for content extraction.");
    }
    try {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['./lib/readability.js']
        });
      } catch (injectionError) {
        if (!injectionError.message || (!injectionError.message.includes('already been injected') && !injectionError.message.includes('Cannot create multiple injection'))) {
          console.warn('Readability injection may have failed:', injectionError);
        }
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          if (typeof Readability === 'undefined') {
            console.warn("Readability not found, falling back to body.innerText");
            return { success: false, error: 'Readability library not found.', fallbackContent: document.body.innerText };
          }
          try {
            const documentClone = document.cloneNode(true);
            const reader = new Readability(documentClone);
            const article = reader.parse();

            if (!article || !article.textContent) {
              console.warn("Readability could not parse meaningful content, falling back to body.innerText");
              return { success: false, error: 'Readability could not parse meaningful content.', fallbackContent: document.body.innerText };
            }

            return {
              title: article.title,
              content: article.textContent,
              byline: article.byline,
              length: article.length,
              excerpt: article.excerpt,
              success: true
            };
          } catch (error) {
            console.error("Error during Readability parsing:", error);
            return { success: false, error: error.message, fallbackContent: document.body.innerText };
          }
        }
      });

      if (!results || !results[0]) {
        throw new Error("Content extraction script did not return results.");
      }
      const result = results[0].result;

      if (!result) {
        throw new Error("Content extraction script result is missing.");
      }

      if (!result.success) {
        console.warn(`Content extraction failed: ${result.error || 'Unknown error'}. Using fallback content if available.`);
        if (result.fallbackContent && result.fallbackContent.trim()) {
          return `Fallback Content:\n\n${result.fallbackContent.trim()}`;
        } else {
          throw new Error(`Content extraction failed: ${result.error || 'Unknown error in content script.'} No fallback available.`);
        }
      }

      console.log(`Readability extracted: ${result.length} chars, Title: ${result.title}`);
      return this.formatExtractedContent(result);

    } catch (error) {
      console.error('Content extraction script execution error:', error);
      const message = error.message.includes('Cannot access contents of url')
        ? "Cannot access content on this page (e.g., chrome:// pages, file:// URLs, or extension pages)."
        : error.message.includes('No tab with id')
          ? "The tab was closed or could not be accessed."
          : `Failed to execute content extraction script: ${error.message}`;
      throw new Error(message);
    }
  }

  static formatExtractedContent(result) {
    let formatted = '';
    if (result.title) {
      formatted += `Title: ${result.title}\n\n`;
    }
    if (result.byline) {
      formatted += `By: ${result.byline}\n\n`;
    }
    formatted += result.content || 'No main content found.';
    return formatted.trim();
  }
}