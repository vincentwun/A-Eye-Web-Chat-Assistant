export class ScreenshotController {
    constructor() {
        this.scrollingScreenshotImages = [];
        this.callbacks = {
            onStart: null
        };
        this.SCROLL_STEP_FRACTION = 0.5;
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

    async captureScreenshots(tab, pageInfo) {
        const { scrollHeight, clientHeight } = pageInfo;
        if (clientHeight <= 0) {
            throw new Error("Client height is zero, cannot capture screenshots.");
        }

        const stepSize = Math.floor(clientHeight * this.SCROLL_STEP_FRACTION);
        const actualStepSize = Math.max(1, stepSize);

        const maxScroll = Math.max(0, scrollHeight - clientHeight);

        let currentScroll = 0;
        await this.executeScroll(tab, 0);
        await new Promise(resolve => setTimeout(resolve, 300));

        let capturedCount = 0;
        const MAX_CAPTURES = 100;

        console.log(`Starting scrolling capture: scrollHeight=${scrollHeight}, clientHeight=${clientHeight}, stepSize=${actualStepSize}, maxScroll=${maxScroll}`);

        while (capturedCount < MAX_CAPTURES) {
            const scrollToPos = Math.min(currentScroll, maxScroll);

            console.log(`Capturing at scroll: ${scrollToPos} (Attempt ${capturedCount + 1})`);
            await this.executeScroll(tab, scrollToPos);
            await new Promise(resolve => setTimeout(resolve, 400));

            try {
                const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

                if (!screenshot) {
                    console.warn(`captureVisibleTab returned empty at scroll: ${scrollToPos}. Retrying.`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const retryScreenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                    if (!retryScreenshot) {
                        throw new Error(`captureVisibleTab failed twice at scroll: ${scrollToPos}`);
                    }
                    this.scrollingScreenshotImages.push(retryScreenshot);
                } else {
                    this.scrollingScreenshotImages.push(screenshot);
                }
                capturedCount++;

                if (scrollToPos >= maxScroll) {
                    console.log(`Captured at or past max scroll (${maxScroll}). Breaking loop.`);
                    break;
                }

                currentScroll += actualStepSize;

                if (currentScroll > scrollHeight && scrollToPos < maxScroll) {
                    console.warn(`Next scroll position (${currentScroll}) exceeds scroll height (${scrollHeight}), but current position (${scrollToPos}) is less than maxScroll (${maxScroll}). Adjusting next scroll to maxScroll for final capture.`);
                    currentScroll = maxScroll;
                }


            } catch (error) {
                if (error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
                    console.warn('Rate limit exceeded. Waiting before retrying...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                } else {
                    console.error(`Error capturing tab at scroll ${scrollToPos}:`, error);
                    throw error;
                }
            }
        }

        if (capturedCount >= MAX_CAPTURES) {
            console.warn(`Reached maximum capture limit (${MAX_CAPTURES}) for scrolling screenshot.`);
        }

        await this.executeScroll(tab, 0);
        console.log(`Scrolling capture finished. Captured ${capturedCount} images.`);
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

    async mergeScreenshots(screenshots, pageDimensions) {
        if (!screenshots || screenshots.length === 0) {
            throw new Error('No screenshots provided to merge');
        }
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const firstImage = await this.loadImage(screenshots[0]);
        const imgWidth = firstImage.width;
        const imgHeight = firstImage.height;

        if (imgWidth === 0 || imgHeight === 0) {
            console.error("First image dimensions:", { width: imgWidth, height: imgHeight });
            throw new Error("Cannot merge screenshots: Invalid initial image dimensions (0).");
        }

        const totalHeight = pageDimensions.scrollHeight;

        canvas.width = imgWidth;
        canvas.height = totalHeight > 0 ? totalHeight : imgHeight * screenshots.length;


        console.log(`Merging ${screenshots.length} screenshots. Target Canvas: ${canvas.width}x${canvas.height}. Viewport height: ${imgHeight}`);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let lastImageBottom = 0;

        const actualStepSize = Math.max(1, Math.floor(imgHeight * this.SCROLL_STEP_FRACTION));


        for (let i = 0; i < screenshots.length; i++) {
            try {
                const image = await this.loadImage(screenshots[i]);
                const currentImgWidth = image.width;
                const currentImgHeight = image.height;

                if (currentImgWidth === 0 || currentImgHeight === 0) {
                    console.warn(`Image ${i} has zero dimensions (${currentImgWidth}x${currentImgHeight}). Skipping draw.`);
                    continue;
                }

                const targetY = i * actualStepSize;

                const isLastImage = (i === screenshots.length - 1);

                let drawHeight = currentImgHeight;
                let sourceY = 0;

                if (totalHeight > 0 && isLastImage && (targetY + currentImgHeight) > totalHeight) {
                    const heightNeededAtBottom = totalHeight - targetY;
                    if (heightNeededAtBottom > 0 && heightNeededAtBottom < currentImgHeight) {
                        drawHeight = heightNeededAtBottom;
                        sourceY = currentImgHeight - drawHeight;
                    } else if (heightNeededAtBottom <= 0) {
                        console.warn(`Calculated needed height for last image is ${heightNeededAtBottom}. Skipping final draw.`);
                        drawHeight = 0;
                    }
                } else if (totalHeight > 0 && targetY >= totalHeight) {
                    console.warn(`Image ${i} targetY (${targetY}) >= totalHeight (${totalHeight}). Skipping draw.`);
                    drawHeight = 0;
                }


                if (drawHeight > 0) {
                    ctx.drawImage(
                        image,
                        0,
                        sourceY,
                        currentImgWidth,
                        drawHeight,

                        0,
                        targetY,
                        currentImgWidth,
                        drawHeight
                    );
                    lastImageBottom = targetY + drawHeight;
                }

            } catch (loadError) {
                console.error(`Failed to load screenshot index ${i} for merging during redraw:`, loadError);
            }
        }

        const finalCanvasHeight = totalHeight > 0 ? totalHeight : lastImageBottom;
        const effectiveFinalHeight = Math.max(finalCanvasHeight, lastImageBottom);


        console.log(`Final canvas height will be adjusted to: ${effectiveFinalHeight}`);

        if (canvas.height > effectiveFinalHeight && effectiveFinalHeight >= 0) {
            console.log(`Resizing canvas height from ${canvas.height} to actual drawn height ${effectiveFinalHeight}`);
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = canvas.width;
            finalCanvas.height = effectiveFinalHeight;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.drawImage(canvas, 0, 0, canvas.width, effectiveFinalHeight, 0, 0, canvas.width, effectiveFinalHeight);
            return finalCanvas.toDataURL('image/png');
        } else if (effectiveFinalHeight < 0) {
            console.warn(`Calculated final canvas height is negative (${effectiveFinalHeight}). Returning empty canvas.`);
            const fallbackCanvas = document.createElement('canvas');
            fallbackCanvas.width = canvas.width || 1;
            fallbackCanvas.height = 1;
            return fallbackCanvas.toDataURL('image/png');

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