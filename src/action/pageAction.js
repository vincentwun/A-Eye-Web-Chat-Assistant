import {
  getCurrentTab,
  executeScriptOnTab,
  waitForTabLoad,
  delay,
} from "../background/backgroundUtils.js";

function clickElement(selector, expectedText) {
  try {
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) {
      throw new Error(`Element not found with selector: ${selector}`);
    }

    let targetElement = null;
    const expectedTrimmedText = expectedText.trim();

    for (const element of elements) {
      const actualText = (
        element.getAttribute("aria-label") ||
        element.title ||
        element.innerText ||
        element.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();

      if (actualText === expectedTrimmedText) {
        targetElement = element;
        break;
      }
    }

    if (!targetElement) {
      const foundTexts = Array.from(elements).map((el) =>
        (
          el.getAttribute("aria-label") ||
          el.title ||
          el.innerText ||
          el.textContent ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 50)
      );
      throw new Error(
        `Element found with selector "${selector}", but none had the matching text "${expectedText}". Found texts snippets: ["${foundTexts.join(
          '", "'
        )}"]`
      );
    }

    if (typeof targetElement.click !== "function") {
      throw new Error(
        `Element found (${selector} with text "${expectedText}") is not clickable.`
      );
    }

    const style = window.getComputedStyle(targetElement);
    const rect = targetElement.getBoundingClientRect();

    if (
      style.visibility === "hidden" ||
      style.display === "none" ||
      rect.width === 0 ||
      rect.height === 0
    ) {
      if (typeof targetElement.focus === "function") {
        targetElement.focus();
        console.warn(
          `Click: Element (${selector} / "${expectedText}") not visible, attempting click after focus.`
        );
      } else {
        throw new Error(
          `Element (${selector} / "${expectedText}") is not visible or focusable.`
        );
      }
    }

    targetElement.click();
    return { status: "Clicked", selector: selector, text: expectedText };
  } catch (error) {
    return {
      error: `Click failed for selector "${selector}" and text "${expectedText}": ${error.message}`,
    };
  }
}

function typeInElement(selector, text) {
  try {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    if (element.isContentEditable) {
      element.focus();
      element.textContent = text;
      element.dispatchEvent(
        new Event("input", { bubbles: true, cancelable: true })
      );
      element.blur();
      return { status: "Typed (contentEditable)", selector, text };
    }
    if (
      typeof element.value === "undefined" ||
      element.disabled ||
      element.readOnly
    ) {
      throw new Error(`Element is not a writable input/textarea: ${selector}`);
    }
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (
      style.visibility === "hidden" ||
      style.display === "none" ||
      rect.width === 0 ||
      rect.height === 0
    ) {
      if (typeof element.focus === "function") {
        element.focus();
        console.warn(
          `Type: Element ${selector} not visible, attempting type after focus.`
        );
      } else throw new Error(`Element is not visible: ${selector}`);
    }
    element.focus();
    element.value = text;
    element.dispatchEvent(
      new Event("input", { bubbles: true, cancelable: true })
    );
    element.dispatchEvent(
      new Event("change", { bubbles: true, cancelable: true })
    );
    element.blur();
    return { status: "Typed", selector, text };
  } catch (error) {
    return { error: `Type failed: ${error.message}` };
  }
}

function simulateKeyPress(selector, keyToPress) {
  try {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    if (typeof element.focus === "function") element.focus();
    else console.warn(`KeyPress: Element ${selector} might not be focusable.`);
    const keyCode = keyToPress === "Enter" ? 13 : 0;
    const eventOptions = {
      key: keyToPress,
      code: keyToPress === "Enter" ? "Enter" : keyToPress,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
    };
    let canceled = !element.dispatchEvent(
      new KeyboardEvent("keydown", eventOptions)
    );
    if (!canceled)
      canceled = !element.dispatchEvent(
        new KeyboardEvent("keypress", eventOptions)
      );
    element.dispatchEvent(new KeyboardEvent("keyup", eventOptions));
    if (canceled)
      console.log(
        `KeyPress: Default action for "${keyToPress}" on ${selector} was prevented.`
      );
    return { status: "Key Pressed", selector, key: keyToPress };
  } catch (error) {
    return {
      error: `KeyPress (${keyToPress} on ${selector}) failed: ${error.message}`,
    };
  }
}

export async function executeJSON(actions) {
  let tab = await getCurrentTab();
  const results = [];

  for (const action of actions) {
    try {
      console.log(`Executing JSON action: ${action.action}`, action);
      let result;
      const actionType = String(action.action || "").trim();
      const actionTypeLower = actionType.toLowerCase();

      switch (actionTypeLower) {
        case "navigate":
          if (!action.url) throw new Error("Navigate action requires 'url'.");
          await chrome.tabs.update(tab.id, { url: action.url });
          await waitForTabLoad(tab.id);
          tab = await chrome.tabs.get(tab.id);
          result = { status: "Navigated", url: action.url };
          break;
        case "click":
          if (!action.selector || typeof action.text !== "string") {
            throw new Error("Click action requires 'selector' and 'text'.");
          }
          result = await executeScriptOnTab(tab.id, clickElement, [
            action.selector,
            action.text,
          ]);
          break;
        case "type":
          if (!action.selector || typeof action.text !== "string")
            throw new Error("Type action requires 'selector' and 'text'.");
          result = await executeScriptOnTab(tab.id, typeInElement, [
            action.selector,
            action.text,
          ]);
          break;
        case "keypress":
          if (!action.selector || !action.key)
            throw new Error("KeyPress action requires 'selector' and 'key'.");
          result = await executeScriptOnTab(tab.id, simulateKeyPress, [
            action.selector,
            action.key,
          ]);
          break;
        default:
          if (actionType !== "") {
            throw new Error(`Unsupported JSON action: ${actionType}`);
          } else {
            console.warn(
              "Encountered action object with missing 'action' property:",
              action
            );
            result = { error: "Missing 'action' property in JSON object." };
          }
          break;
      }
      if (result) {
        results.push({ action: actionType, ...result });
      }
      if (!result || !result.error) {
        await delay(500);
      }
    } catch (error) {
      console.error(
        `Error during JSON action ${action.action || "N/A"}:`,
        error
      );
      throw new Error(
        `Failed JSON action '${action.action || "N/A"}' (Selector: ${
          action.selector || "N/A"
        }): ${error.message}`
      );
    }
  }
  return results;
}
