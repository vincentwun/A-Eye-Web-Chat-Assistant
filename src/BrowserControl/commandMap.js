export class CommandProcessor {
  constructor(actions) {
    if (!actions || typeof actions !== 'object') {
      throw new Error('CommandProcessor requires an actions object');
    }
    this.actions = actions;
    console.log('CommandProcessor initialized with actions:', Object.keys(this.actions));
  }

  processResponse(responseText) {
    const normalizedText = responseText.trim();
    console.log('CommandProcessor processing:', normalizedText);

    if (normalizedText.startsWith('openUrl:')) {
      const url = normalizedText.substring('openUrl:'.length).trim();
      if (url && typeof this.actions._executeOpenUrl === 'function') {
        console.log(`Executing command internally: openUrl with URL: ${url}`);
        try {
          this.actions._executeOpenUrl(url);
          return true;
        } catch (error) {
          console.error('Error executing _executeOpenUrl command:', error);
          if (typeof this.actions.handleError === 'function') {
            this.actions.handleError(`Failed to execute internal open URL command for: ${url}`, error);
          }
          return true;
        }
      } else if (!url) {
        console.warn('Command "openUrl:" recognized, but URL is missing.');
        return false;
      }
      else {
        console.warn('Command "openUrl:" recognized, but internal action handler _executeOpenUrl is missing or not a function.');
        return false;
      }
    }

    else if (normalizedText === 'takeScreenshot') {
      if (typeof this.actions._executeScreenshot === 'function') {
        console.log('Executing command internally: takeScreenshot');
        try {
          this.actions._executeScreenshot();
          return true;
        } catch (error) {
          console.error('Error executing _executeScreenshot command:', error);
          if (typeof this.actions.handleError === 'function') {
            this.actions.handleError('Failed to execute internal screenshot command', error);
          }
          return true;
        }
      } else {
        console.warn('Command "takeScreenshot" recognized, but internal action handler _executeScreenshot is missing or not a function.');
        return false;
      }
    } else if (normalizedText === 'scrollingScreenshot') {
      if (typeof this.actions._executeScrollingScreenshot === 'function') {
        console.log('Executing command internally: scrollingScreenshot');
        try {
          this.actions._executeScrollingScreenshot();
          return true;
        } catch (error) {
          console.error('Error executing _executeScrollingScreenshot command:', error);
          if (typeof this.actions.handleError === 'function') {
            this.actions.handleError('Failed to execute internal scrolling screenshot command', error);
          }
          return true;
        }
      } else {
        console.warn('Command "scrollingScreenshot" recognized, but internal action handler _executeScrollingScreenshot is missing or not a function.');
        return false;
      }
    } else if (normalizedText === 'analyzeContent') {
      if (typeof this.actions._executeContentAnalysis === 'function') {
        console.log('Executing command internally: analyzeContent');
        try {
          this.actions._executeContentAnalysis();
          return true;
        } catch (error) {
          console.error('Error executing _executeContentAnalysis command:', error);
          if (typeof this.actions.handleError === 'function') {
            this.actions.handleError('Failed to execute internal content analysis command', error);
          }
          return true;
        }
      } else {
        console.warn('Command "analyzeContent" recognized, but internal action handler _executeContentAnalysis is missing or not a function.');
        return false;
      }
    }

    console.log('No command recognized in response.');
    return false;
  }
}