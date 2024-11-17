export class ScreenshotController {
  constructor() {
      this.rollingScreenshotImages = [];
  }

  async captureVisibleTab() {
      try {
          return await chrome.tabs.captureVisibleTab();
      } catch (error) {
          throw new Error(`Screenshot capture failed: ${error.message}`);
      }
  }

  validatePageInfo(pageInfo) {
      return pageInfo && pageInfo.scrollHeight && pageInfo.clientHeight;
  }

  async getPageInfo() {
      return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
              type: 'startRollingScreenshot'
          }, response => {
              if (!response) {
                  reject(new Error('Failed to get page dimensions'));
                  return;
              }
              resolve(response);
          });
      });
  }

  async handleRollingScreenshot(tab) {
      this.rollingScreenshotImages = [];

      const pageInfo = await this.getPageInfo();
      if (!this.validatePageInfo(pageInfo)) {
          throw new Error('Invalid page dimensions');
      }

      await this.captureScreenshots(tab, pageInfo);
      return await this.mergeScreenshots(this.rollingScreenshotImages);
  }

  async captureScreenshots(tab, pageInfo) {
      const { scrollHeight, clientHeight } = pageInfo;
      let currentScroll = 0;

      await this.executeScroll(tab, 0);

      while (currentScroll < scrollHeight) {
          try {
              const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
              this.rollingScreenshotImages.push(screenshot);
          } catch (error) {
              if (error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
                  console.warn('Rate limit exceeded. Waiting before retrying...');
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  continue;
              } else {
                  throw error;
              }
          }

          currentScroll += clientHeight;
          await this.executeScroll(tab, currentScroll);
          await new Promise(resolve => setTimeout(resolve, 600));
      }

      await this.executeScroll(tab, 0);
  }

  async executeScroll(tab, scrollPosition) {
      await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: (scroll) => window.scrollTo({ top: scroll, behavior: 'instant' }),
          args: [scrollPosition]
      });
  }

  async mergeScreenshots(screenshots) {
      if (!screenshots.length) {
          throw new Error('No screenshots to merge');
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const firstImage = await this.loadImage(screenshots[0]);
      canvas.width = firstImage.width;
      canvas.height = firstImage.height * screenshots.length;

      for (let i = 0; i < screenshots.length; i++) {
          const image = await this.loadImage(screenshots[i]);
          ctx.drawImage(image, 0, i * firstImage.height);
      }

      return canvas.toDataURL('image/png');
  }

  loadImage(src) {
      return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
      });
  }

  cleanup() {
      this.rollingScreenshotImages = [];
  }
}