export class ScreenshotController {
    constructor() {
        this.scrollingScreenshotImages = [];
        this.callbacks = {
            onStart: null
        };
    }

    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    async captureVisibleTab() {
        try {
            return await chrome.tabs.captureVisibleTab();
        } catch (error) {
            throw new Error(`Screenshot capture failed: ${error.message}`);
        }
    }

    validatePageInfo(pageDimensions) {
        const isValid = pageDimensions &&
            typeof pageDimensions.scrollHeight === 'number' &&
            pageDimensions.scrollHeight >= 0 &&
            typeof pageDimensions.clientHeight === 'number' &&
            pageDimensions.clientHeight > 0;
        if (!isValid) {
            console.warn("Validation failed for page dimensions:", pageDimensions);
        }
        return isValid;
    }

    async getPageInfo() {
        console.log("Requesting page info from background...");
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'startScrollingScreenshot'
            }, response => {
                if (chrome.runtime.lastError) {
                    console.error("getPageInfo - Runtime Error:", chrome.runtime.lastError);
                    reject(new Error(`Messaging error: ${chrome.runtime.lastError.message}`));
                    return;
                }
                if (!response) {
                    console.error("getPageInfo - No response received from background.");
                    reject(new Error('Failed to get page dimensions: No response from background.'));
                    return;
                }
                if (response.error) {
                    console.error("getPageInfo - Error from background:", response.error);
                    reject(new Error(`Failed to get page dimensions: ${response.error}`));
                    return;
                }
                if (response.dimensions === null || response.dimensions === undefined) {
                    console.error("getPageInfo - Dimensions are null or undefined in response:", response);
                    reject(new Error('Failed to get page dimensions: Background returned null/undefined dimensions.'));
                    return;
                }
                console.log("Received dimensions from background:", response.dimensions);
                resolve(response.dimensions);
            });
        });
    }

    async handleScrollingScreenshot(tab) {
        this.scrollingScreenshotImages = [];
        try {
            const pageDimensions = await this.getPageInfo();
            console.log('handleScrollingScreenshot - Dimensions received:', pageDimensions);
            if (!this.validatePageInfo(pageDimensions)) {
                throw new Error('Invalid page dimensions received (e.g., clientHeight is 0 or values are not numbers).');
            }

            if (pageDimensions.scrollHeight <= pageDimensions.clientHeight + 1) {
                console.log("Page doesn't need scrolling. Capturing single visible tab.");
                const singleShot = await this.captureVisibleTab();
                if (!singleShot) {
                    throw new Error("Failed to capture single visible tab for non-scrolling page.");
                }
                return singleShot;
            }


            if (this.callbacks.onStart) {
                this.callbacks.onStart();
            }

            await this.captureScreenshots(tab, pageDimensions);
            return await this.mergeScreenshots(this.scrollingScreenshotImages, pageDimensions);
        } catch (error) {
            console.error("Error during scrolling screenshot process:", error);
            throw error;
        }
    }

    async getScrollPosition(tabId) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId },
                function: () => window.scrollY,
            });
            return results?.[0]?.result ?? 0;
        } catch (error) {
            console.error('Failed to get scroll position:', error);
            return 0;
        }
    }

    async captureScreenshots(tab, pageInfo) {
        const { scrollHeight, clientHeight } = pageInfo;
        if (clientHeight <= 0) throw new Error("Client height is zero, cannot capture screenshots.");

        const maxScroll = scrollHeight - clientHeight;
        const overlap = 60;
        const stepSize = clientHeight > overlap ? clientHeight - overlap : clientHeight;

        console.log(`Starting scrolling capture: scrollHeight=${scrollHeight}, clientHeight=${clientHeight}, stepSize=${stepSize}, maxScroll=${maxScroll}`);

        const capturedPositions = new Set();
        const MAX_CAPTURES = 100;
        let currentScroll = 0;

        while (this.scrollingScreenshotImages.length < MAX_CAPTURES) {
            await this.executeScroll(tab, currentScroll);
            await new Promise(resolve => setTimeout(resolve, 300));

            const actualScrollY = await this.getScrollPosition(tab.id);

            if (capturedPositions.has(actualScrollY)) {
                console.log(`Already captured at scroll position ${actualScrollY}. Ending capture.`);
                break;
            }

            console.log(`Capturing at scroll: ${actualScrollY} (Attempt ${this.scrollingScreenshotImages.length + 1})`);

            try {
                const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                if (screenshot) {
                    this.scrollingScreenshotImages.push({ image: screenshot, y: actualScrollY });
                    capturedPositions.add(actualScrollY);
                } else {
                    console.warn(`captureVisibleTab returned empty at scroll: ${actualScrollY}.`);
                }
            } catch (error) {
                if (error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
                    console.warn('Rate limit exceeded. Waiting before retrying...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                console.error(`Error capturing tab at scroll ${actualScrollY}:`, error);
                throw error;
            }

            if (actualScrollY >= maxScroll) {
                console.log("Captured at or past max scroll. Finishing.");
                break;
            }

            currentScroll += stepSize;
            if (currentScroll > maxScroll) {
                currentScroll = maxScroll;
            }
        }

        if (this.scrollingScreenshotImages.length >= MAX_CAPTURES) {
            console.warn(`Reached maximum capture limit (${MAX_CAPTURES}).`);
        }

        await this.executeScroll(tab, 0);
        console.log(`Scrolling capture finished. Captured ${this.scrollingScreenshotImages.length} images.`);
    }

    async executeScroll(tab, scrollPosition) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: (scroll) => {
                    window.scrollTo({ top: scroll, behavior: 'instant' });
                },
                args: [scrollPosition]
            });
            await new Promise(resolve => setTimeout(resolve, 50));

        } catch (error) {
            console.error(`Failed to execute scroll to ${scrollPosition} on tab ${tab.id}:`, error);
            throw new Error(`Failed to scroll page: ${error.message}`);
        }
    }

    async mergeScreenshots(capturedData, pageDimensions) {
        if (!capturedData || capturedData.length === 0) {
            throw new Error('No screenshots provided to merge');
        }

        const firstImageLoaded = await this.loadImage(capturedData[0].image);
        const imgWidth = firstImageLoaded.width;
        const totalHeight = pageDimensions.scrollHeight;

        if (imgWidth === 0 || totalHeight <= 0) {
            console.error("Cannot merge: Invalid dimensions.", { imgWidth, totalHeight });
            throw new Error("Cannot merge screenshots: Invalid dimensions (width is 0 or scrollHeight is 0).");
        }

        const canvas = document.createElement('canvas');
        canvas.width = imgWidth;
        canvas.height = totalHeight;
        const ctx = canvas.getContext('2d');

        console.log(`Creating final canvas: ${canvas.width}x${canvas.height}`);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < capturedData.length; i++) {
            const item = capturedData[i];
            try {
                const image = (i === 0) ? firstImageLoaded : await this.loadImage(item.image);
                console.log(`Drawing image ${i} at y: ${item.y}`);
                ctx.drawImage(image, 0, item.y);
            } catch (loadError) {
                console.error(`Failed to load and draw screenshot index ${i} for merging:`, loadError);
            }
        }

        return canvas.toDataURL('image/png');
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => {
                console.error("Image load error:", err, "Src:", src ? src.substring(0, 100) + "..." : 'empty');
                reject(new Error("Failed to load image"));
            };
            img.src = src;
        });
    }

    cleanup() {
        this.scrollingScreenshotImages = [];
        console.log("ScreenshotController cleaned up.");
    }
}