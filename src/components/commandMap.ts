type CommandActions = {
  handleError?: (message: string, error: unknown) => void;
  _executeScreenshot?: () => void;
  _executeScrollingScreenshot?: () => void;
  _executeContentAnalysis?: () => void;
};

export class CommandProcessor {
  private actions: CommandActions & { handleError: (message: string, error: unknown) => void };

  constructor(actions: CommandActions) {
    if (!actions || typeof actions !== 'object') { throw new Error('CommandProcessor requires an actions object'); }
    if (typeof actions.handleError !== 'function') { console.warn("CommandProcessor initialized without a valid handleError function."); actions.handleError = (message, error) => { console.error("CommandProcessor Error:", message, error); }; }
    this.actions = actions as CommandActions & { handleError: (message: string, error: unknown) => void };
    console.log('CommandProcessor initialized with actions:', Object.keys(this.actions));
  }

  processResponse(responseText: string | null | undefined) {
    const normalizedText = responseText?.trim() ?? '';
    console.log('CommandProcessor processing:', normalizedText);

    let cleanedText = normalizedText;
    if ((cleanedText.startsWith("'") && cleanedText.endsWith("'")) || (cleanedText.startsWith('"') && cleanedText.endsWith('"'))) {
      cleanedText = cleanedText.substring(1, cleanedText.length - 1);
      console.log('Cleaned surrounding quotes, new text:', cleanedText);
    }

    const jsonRegex = /```(?:json)?\s*(\[[\s\S]*?\])\s*```/s;
    const match = cleanedText.match(jsonRegex);
    let potentialJson = null;

    if (match && match[1]) {
      potentialJson = match[1];
      console.log("Potential JSON array found within code fences:", potentialJson);
    }
    else if (cleanedText.startsWith('[') && cleanedText.endsWith(']')) {
      potentialJson = cleanedText;
      console.log("Potential raw JSON array found:", potentialJson);
    }

    if (potentialJson !== null) {
      try {
        const parsedJson = JSON.parse(potentialJson);
        if (Array.isArray(parsedJson)) {
          if (parsedJson.length > 0 && typeof parsedJson[0] === 'object' && parsedJson[0]?.action) {
            console.log('Command recognized: JSON Action Array. Indicating action to caller.');
            return { command: 'executeActions', actions: parsedJson };
          } else {
            console.warn("Parsed JSON array is empty or first item lacks 'action' property.");
          }
        }
      } catch (e) {
        console.warn(`Failed to parse potential JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (cleanedText === 'getElement') {
      console.log('Command recognized: getElement. Indicating action to caller.');
      return { command: 'getElement' };
    }

    switch (cleanedText) {
      case 'takeScreenshot':
        return this.executeInternal('_executeScreenshot', 'takeScreenshot', 'Failed internal screenshot command');
      case 'scrollingScreenshot':
        return this.executeInternal('_executeScrollingScreenshot', 'scrollingScreenshot', 'Failed internal scrolling screenshot command');
      case 'analyzeContent':
      case 'analyseContent':
        return this.executeInternal('_executeContentAnalysis', 'analyzeContent', 'Failed internal content analysis command');
    }

    console.log('No specific command recognized in response by CommandProcessor.');
    return false;
  }

  private executeInternal(handler: '_executeScreenshot' | '_executeScrollingScreenshot' | '_executeContentAnalysis', name: string, failure: string): boolean {
    const action = this.actions[handler];
    if (typeof action !== 'function') {
      console.warn(`${name} handler missing.`);
      return false;
    }
    console.log(`Executing internal command: ${name}`);
    try { action.call(this.actions); }
    catch (error) { this.actions.handleError(failure, error); }
    return true;
  }
}
