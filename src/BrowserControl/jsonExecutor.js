export async function executeJSON(actions, dependencies) {
  const { getCurrentTab, executeScriptOnTab, waitForTabLoad, delay, clickElement, typeInElement, simulateKeyPress, scrollPage } = dependencies;
  let tab = await getCurrentTab();
  const results = [];

  for (const action of actions) {
    try {
      console.log(`Executing JSON action: ${action.action}`, action);
      let result;
      const actionType = String(action.action || '').trim();
      const actionTypeLower = actionType.toLowerCase();

      switch (actionTypeLower) {
        case 'navigate':
          if (!action.url) throw new Error("Navigate action requires 'url'.");
          await chrome.tabs.update(tab.id, { url: action.url });
          await waitForTabLoad(tab.id);
          tab = await chrome.tabs.get(tab.id);
          result = { status: 'Navigated', url: action.url };
          break;
        case 'click':
          if (!action.selector) throw new Error("Click action requires 'selector'.");
          result = await executeScriptOnTab(tab.id, clickElement, [action.selector]);
          break;
        case 'type':
          if (!action.selector || typeof action.text !== 'string') throw new Error("Type action requires 'selector' and 'text'.");
          result = await executeScriptOnTab(tab.id, typeInElement, [action.selector, action.text]);
          break;
        case 'keypress':
          if (!action.selector || !action.key) throw new Error("KeyPress action requires 'selector' and 'key'.");
          result = await executeScriptOnTab(tab.id, simulateKeyPress, [action.selector, action.key]);
          break;
        case 'scroll':
          if (!action.direction) throw new Error("Scroll action requires 'direction'.");
          result = await executeScriptOnTab(tab.id, scrollPage, [action.direction, action.amount]);
          break;
        default:
          if (actionType !== '') {
            throw new Error(`Unsupported JSON action: ${actionType}`);
          } else {
            console.warn("Encountered action object with missing 'action' property:", action);
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
      console.error(`Error during JSON action ${action.action || 'N/A'}:`, error);
      throw new Error(`Failed JSON action '${action.action || 'N/A'}' (Selector: ${action.selector || 'N/A'}): ${error.message}`);
    }
  }
  return results;
}