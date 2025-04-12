export class ContentExtractor {

  static async extractPageContent(tab) {
    if (!tab || !tab.id) {
      throw new Error("Invalid tab provided for content extraction.");
    }
    console.log("Starting content extraction for tab:", tab.id);
    try {
      try {
        console.log("Injecting readability.js...");
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['./lib/readability.js']
        });
        console.log("Readability injected (or already present).");
      } catch (injectionError) {
        if (!injectionError.message || (!injectionError.message.includes('already been injected') && !injectionError.message.includes('Cannot create multiple injection'))) {
          console.warn('Readability injection may have failed:', injectionError);
        } else {
          console.log("Readability already injected.");
        }
      }

      const executionFunction = () => {
        if (typeof Readability === 'undefined') {
          console.warn("Readability library not found in content script, falling back to body.innerText");
          const fallbackContent = document.body ? document.body.innerText : '';
          return {
            success: !!fallbackContent,
            content: fallbackContent || null,
            method: 'Fallback',
            error: 'Readability library not found.'
          };
        }
        try {
          const documentClone = document.cloneNode(true);
          const reader = new Readability(documentClone);
          const article = reader.parse();

          if (!article || !article.textContent) {
            console.warn("Readability could not parse meaningful content, falling back to body.innerText");
            const fallbackContent = document.body ? document.body.innerText : '';
            return {
              success: !!fallbackContent,
              content: fallbackContent || null,
              method: 'Fallback',
              error: 'Readability could not parse meaningful content.'
            };
          }

          return {
            title: article.title || null,
            content: article.textContent || null,
            method: 'Readability',
            success: true
          };
        } catch (error) {
          console.error("Error during Readability parsing:", error);
          const fallbackContent = document.body ? document.body.innerText : '';
          return {
            success: !!fallbackContent,
            content: fallbackContent || null,
            method: 'Fallback',
            error: `Readability parsing error: ${error.message}`
          };
        }
      };

      console.log("Executing content extraction script...");
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: executionFunction
      });
      console.log("Script execution results:", results);

      if (!results || !results[0] || !results[0].result) {
        if (results && results[0] && results[0].frameId === undefined) {
          console.error("Content extraction script likely failed to execute properly (missing frameId). URL:", tab.url);
          throw new Error("Content script did not execute correctly. Check page permissions or content script errors in the target page's console.");
        }
        console.error("Content extraction script did not return a valid result object:", results);
        throw new Error("Content extraction script did not return expected results.");
      }

      const extractedData = results[0].result;
      console.log("Extracted data object:", extractedData);

      if (!extractedData.success || !extractedData.content || !extractedData.content.trim()) {
        const errorMsg = extractedData.error || 'No content extracted.';
        console.warn(`Content extraction unsuccessful or content is empty. Method: ${extractedData.method || 'Unknown'}. Error: ${errorMsg}`);
        throw new Error(`Content extraction failed: ${errorMsg} (Method: ${extractedData.method || 'N/A'})`);
      }

      console.log(`Content extraction successful. Method: ${extractedData.method}, Title: ${extractedData.title || 'N/A'}, Length: ${extractedData.content.length}`);
      return {
        content: extractedData.content,
        title: extractedData.title,
        method: extractedData.method
      };

    } catch (error) {
      console.error('Content extraction process error:', error);
      const message = error.message.includes('Cannot access contents of url') || error.message.includes('tab URL: "chrome')
        ? "Cannot access content on this page (e.g., chrome:// pages, file:// URLs, or extension pages)."
        : error.message.includes('No tab with id')
          ? "The tab was closed or could not be accessed."
          : error.message.includes('Receiving end does not exist')
            ? "The connection to the tab was lost, it might have been closed."
            : error.message;
      const finalMessage = (message === error.message) ? `Failed to execute content extraction script: ${error.message}` : message;
      throw new Error(finalMessage);
    }
  }

}