export class CommandProcessor {
  constructor(actions) {
    if (!actions || typeof actions !== "object") {
      throw new Error("CommandProcessor requires an actions object");
    }
    this.actions = actions;
    if (typeof this.actions.handleError !== "function") {
      console.warn(
        "CommandProcessor initialized without a valid handleError function."
      );
      this.actions.handleError = (message, error) => {
        console.error("CommandProcessor Error:", message, error);
      };
    }
    console.log(
      "CommandProcessor initialized with actions:",
      Object.keys(this.actions)
    );
  }

  processResponse(responseText) {
    const normalizedText = responseText?.trim() ?? "";
    console.log("CommandProcessor processing:", normalizedText);

    let cleanedText = normalizedText;
    if (
      (cleanedText.startsWith("'") && cleanedText.endsWith("'")) ||
      (cleanedText.startsWith('"') && cleanedText.endsWith('"'))
    ) {
      cleanedText = cleanedText.substring(1, cleanedText.length - 1);
      console.log("Cleaned surrounding quotes, new text:", cleanedText);
    }

    const jsonRegex = /```(?:json)?\s*(\[[\s\S]*?\])\s*```/s;
    const match = cleanedText.match(jsonRegex);
    let potentialJson = null;

    if (match && match[1]) {
      potentialJson = match[1];
      console.log(
        "Potential JSON array found within code fences:",
        potentialJson
      );
    } else if (cleanedText.startsWith("[") && cleanedText.endsWith("]")) {
      potentialJson = cleanedText;
      console.log("Potential raw JSON array found:", potentialJson);
    }

    if (potentialJson !== null) {
      try {
        const parsedJson = JSON.parse(potentialJson);
        if (Array.isArray(parsedJson)) {
          if (
            parsedJson.length > 0 &&
            typeof parsedJson[0] === "object" &&
            parsedJson[0]?.action
          ) {
            console.log(
              "Command recognized: JSON Action Array. Indicating action to caller."
            );
            return { command: "executeActions", actions: parsedJson };
          } else {
            console.warn(
              "Parsed JSON array is empty or first item lacks 'action' property."
            );
          }
        }
      } catch (e) {
        console.warn(`Failed to parse potential JSON: ${e.message}`);
      }
    }

    if (cleanedText === "getElement") {
      console.log(
        "Command recognized: getElement. Indicating action to caller."
      );
      return { command: "getElement" };
    }

    if (cleanedText === "takeScreenshot") {
      if (typeof this.actions._executeScreenshot === "function") {
        console.log("Executing internal command: takeScreenshot");
        try {
          this.actions._executeScreenshot();
          return true;
        } catch (error) {
          this.actions.handleError("Failed internal screenshot command", error);
          return true;
        }
      } else {
        console.warn("takeScreenshot handler missing.");
        return false;
      }
    } else if (cleanedText === "scrollingScreenshot") {
      if (typeof this.actions._executeScrollingScreenshot === "function") {
        console.log("Executing internal command: scrollingScreenshot");
        try {
          this.actions._executeScrollingScreenshot();
          return true;
        } catch (error) {
          this.actions.handleError(
            "Failed internal scrolling screenshot command",
            error
          );
          return true;
        }
      } else {
        console.warn("scrollingScreenshot handler missing.");
        return false;
      }
    } else if (
      cleanedText === "analyzeContent" ||
      cleanedText === "analyseContent"
    ) {
      if (typeof this.actions._executeContentAnalysis === "function") {
        console.log("Executing internal command: analyzeContent");
        try {
          this.actions._executeContentAnalysis();
          return true;
        } catch (error) {
          this.actions.handleError(
            "Failed internal content analysis command",
            error
          );
          return true;
        }
      } else {
        console.warn("analyzeContent handler missing.");
        return false;
      }
    }

    console.log(
      "No specific command recognized in response by CommandProcessor."
    );
    return false;
  }
}
