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

            if (pageDimensions.scrollHeight <= pageDimensions.clientHeight) {
                console.log("Page doesn't need scrolling. Capturing single visible tab.");
                // Simple case: capture once and return
                const singleShot = await this.captureVisibleTab();
                if (!singleShot) {
                    throw new Error("Failed to capture single visible tab for non-scrolling page.");
                }
                return singleShot; // Return the single data URL directly
            }

            if (this.callbacks.onStart) {
                this.callbacks.onStart();
            }

            await this.captureScreenshots(tab, pageDimensions);
            return await this.mergeScreenshots(this.scrollingScreenshotImages, pageDimensions); // Pass dimensions for accurate merge

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

        let currentScroll = 0;
        const maxScroll = scrollHeight - clientHeight;
        await this.executeScroll(tab, 0);
        await new Promise(resolve => setTimeout(resolve, 300));

        let capturedCount = 0;
        const MAX_CAPTURES = 50;

        while (currentScroll < scrollHeight && capturedCount < MAX_CAPTURES) {
            const scrollToPos = Math.min(currentScroll, maxScroll > 0 ? maxScroll : 0);
            await this.executeScroll(tab, scrollToPos);
            await new Promise(resolve => setTimeout(resolve, 400));

            try {
                console.log(`Capturing at scroll: ${scrollToPos}`);
                const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                if (!screenshot) {
                    console.warn(`captureVisibleTab returned empty at scroll: ${scrollToPos}. Skipping.`);
                    // Decide how to handle this - continue or error out?
                    // Continuing might leave gaps. Let's retry once after a delay.
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

            if (currentScroll >= maxScroll) {
                console.log(`Reached or passed max scroll (${maxScroll}). Breaking loop.`);
                break;
            }
            currentScroll += clientHeight;
            if (currentScroll >= scrollHeight) {
                console.log(`Calculated next scroll (${currentScroll}) >= scrollHeight (${scrollHeight}). Capturing last part done.`);
                // Ensure the last bit is captured if needed, loop condition handles this break mostly
            }
        }

        if (capturedCount >= MAX_CAPTURES) {
            console.warn("Reached maximum capture limit for scrolling screenshot.");
        }

        await this.executeScroll(tab, 0);
    }

    async executeScroll(tab, scrollPosition) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: (scroll) => window.scrollTo({ top: scroll, behavior: 'instant' }),
                args: [scrollPosition]
            });
        } catch (error) {
            console.error(`Failed to execute scroll to ${scrollPosition} on tab ${tab.id}:`, error);
            // Decide if this should be a fatal error for the screenshot process
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
            throw new Error("Cannot merge screenshots: Invalid image dimensions (0).");
        }

        const totalHeight = pageDimensions.scrollHeight;
        canvas.width = imgWidth;
        canvas.height = totalHeight > 0 ? totalHeight : imgHeight * screenshots.length; // Use scrollHeight if valid, else estimate

        console.log(`Merging ${screenshots.length} screenshots. Target Canvas: ${canvas.width}x${canvas.height}. Viewport height: ${imgHeight}`);

        let currentY = 0;
        for (let i = 0; i < screenshots.length; i++) {
            try {
                const image = await this.loadImage(screenshots[i]);

                // Calculate how much of this image to draw based on remaining total height
                const remainingHeight = totalHeight - currentY;
                const drawHeight = (i === screenshots.length - 1 && totalHeight > 0)
                    ? Math.min(imgHeight, remainingHeight > 0 ? remainingHeight : imgHeight) // Use remaining or full imgHeight for last piece
                    : imgHeight;

                if (drawHeight <= 0) {
                    console.warn(`Calculated draw height is ${drawHeight} for image ${i}. Skipping draw.`);
                    continue; // Skip drawing if height is zero or negative
                }

                // Draw the relevant part of the screenshot
                // void ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
                ctx.drawImage(
                    image,
                    0, // sx: source x
                    0, // sy: source y
                    imgWidth, // sWidth: source width
                    drawHeight, // sHeight: source height (crop if needed for last image)
                    0, // dx: destination x
                    currentY, // dy: destination y
                    imgWidth, // dWidth: destination width
                    drawHeight // dHeight: destination height
                );
                currentY += drawHeight;

                // Break if we've already drawn enough (shouldn't happen if logic is right)
                if (totalHeight > 0 && currentY >= totalHeight) {
                    console.log(`CurrentY (${currentY}) reached/exceeded totalHeight (${totalHeight}). Stopping merge loop.`);
                    break;
                }

            } catch (loadError) {
                console.error(`Failed to load screenshot index ${i} for merging:`, loadError);
                throw new Error(`Failed to load image ${i} for merging.`);
            }
        }

        // Optional: If totalHeight was used, ensure canvas isn't larger than drawn content
        if (totalHeight > 0 && canvas.height > currentY) {
            console.log(`Resizing canvas height from ${canvas.height} to actual drawn height ${currentY}`);
            // Create a new canvas with the correct height and copy content
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = canvas.width;
            finalCanvas.height = currentY;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.drawImage(canvas, 0, 0);
            return finalCanvas.toDataURL('image/png');
        }


        return canvas.toDataURL('image/png');
    }


    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => {
                console.error("Image load error:", err, "Src:", src.substring(0, 100) + "...");
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