import { getCurrentTab, executeScriptOnTab } from './backgroundUtils.js';
import { findAllInteractableElements } from './elementInspector.js';

export async function findElementsOnPage() {
  try {
    const tab = await getCurrentTab();
    if (!tab || !tab.id) {
      throw new Error("Could not get active tab ID for finding elements.");
    }

    const elements = await executeScriptOnTab(tab.id, findAllInteractableElements);

    if (elements && Array.isArray(elements)) {
      console.log(`Found ${elements.length} elements.`);
      return { success: true, elements: elements };
    } else {
      console.log("No interactable elements found or script returned unexpected format.");
      return { success: true, elements: [] };
    }
  } catch (error) {
    console.error("Error finding interactable elements:", error);
    return { success: false, error: `Error finding elements: ${error.message}` };
  }
}