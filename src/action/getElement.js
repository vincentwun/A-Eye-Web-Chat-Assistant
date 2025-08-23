import { getCurrentTab, executeScriptOnTab } from '../background/backgroundUtils.js';

function findAllInteractableElements() {
  function isVisible(element) {
    if (!element || !element.tagName) return false;
    if (!document.body.contains(element)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      if (element.children.length === 0 && !['input', 'textarea', 'select', 'button'].includes(element.tagName.toLowerCase())) {
        if (element.offsetParent === null) return false;
      }
      if (element.tagName === 'INPUT' && element.type === 'hidden') return false;
    }
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.display === 'none') return false;
      if (parentStyle.overflow === 'hidden' || parentStyle.overflowX === 'hidden' || parentStyle.overflowY === 'hidden') {
        const parentRect = parent.getBoundingClientRect();
        if (parentRect.width > 0 && parentRect.height > 0) {
          const elementCenterY = rect.top + rect.height / 2;
          const elementCenterX = rect.left + rect.width / 2;
          if (elementCenterY < parentRect.top || elementCenterY > parentRect.bottom || elementCenterX < parentRect.left || elementCenterX > parentRect.right) {
          }
        }
      }
      parent = parent.parentElement;
    }
    return true;
  }

  function generateSelector(element) {
    if (!element || !element.tagName) return null;
    try {
      const testAttrs = ['data-testid', 'data-cy', 'data-test-id'];
      for (const attr of testAttrs) {
        const value = element.getAttribute(attr);
        if (value) {
          const testSelector = `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
          if (document.querySelectorAll(testSelector).length === 1) return testSelector;
        }
      }
      if (element.id) {
        const idSelector = `#${CSS.escape(element.id)}`;
        try {
          if (document.querySelectorAll(idSelector).length === 1) return idSelector;
        } catch (idError) {
        }
      }
      const nameAttr = element.getAttribute('name');
      if (nameAttr) {
        const nameSelector = `${element.tagName.toLowerCase()}[name="${CSS.escape(nameAttr)}"]`;
        if (document.querySelectorAll(nameSelector).length === 1) return nameSelector;
      }
      const classes = Array.from(element.classList).filter(c => c.trim() !== '').map(c => `.${CSS.escape(c)}`).join('');
      if (classes) {
        const classSelector = element.tagName.toLowerCase() + classes;
        try {
          if (document.querySelectorAll(classSelector).length === 1) return classSelector;
        } catch (classError) {
        }
      }
      if (nameAttr && classes) {
        const tagNameClassSelector = `${element.tagName.toLowerCase()}[name="${CSS.escape(nameAttr)}"]${classes}`;
        if (document.querySelectorAll(tagNameClassSelector).length === 1) return tagNameClassSelector;
      }
      return classes ? element.tagName.toLowerCase() + classes : element.tagName.toLowerCase();
    } catch (e) {
      return element.tagName.toLowerCase();
    }
  }

  const selectors = ['a[href]', 'button:not([disabled])', 'input:not([type="hidden"]):not([disabled])', 'textarea:not([disabled])', 'select:not([disabled])', '[role="button"]:not([aria-disabled="true"])', '[role="link"]:not([aria-disabled="true"])', '[role="menuitem"]:not([aria-disabled="true"])', '[role="checkbox"]:not([aria-disabled="true"])', '[role="radio"]:not([aria-disabled="true"])', '[role="tab"]:not([aria-disabled="true"])', '[role="option"]:not([aria-disabled="true"])', '[role="combobox"]:not([aria-disabled="true"])', '[role="textbox"]:not([aria-disabled="true"])', '[role="searchbox"]:not([aria-disabled="true"])', '[role="listbox"]:not([aria-disabled="true"])', '[role="switch"]:not([aria-disabled="true"])', '[role="slider"]:not([aria-disabled="true"])', '[role="spinbutton"]:not([aria-disabled="true"])', '[role="treeitem"]:not([aria-disabled="true"])', '[onclick]:not(body):not(html):not(div)', '[contenteditable="true"]:not([aria-disabled="true"])', 'details summary'];
  const interactableElements = [];
  const uniqueElements = new Set();
  document.querySelectorAll(selectors.join(', ')).forEach(element => {
    if (uniqueElements.has(element)) return;
    const isDisabled = element.disabled || element.getAttribute('aria-disabled') === 'true';
    if (isDisabled) return;
    if (!isVisible(element)) return;
    uniqueElements.add(element);
    const tagName = element.tagName.toLowerCase();
    const selector = generateSelector(element);
    let textContent = '';
    textContent = element.getAttribute('aria-label') || element.title || '';
    if (!textContent) {
      if (tagName === 'input') textContent = element.value || element.placeholder || '';
      else if (tagName === 'textarea') textContent = element.value || element.placeholder || '';
      else if (tagName === 'select') textContent = element.options[element.selectedIndex]?.text || '';
      else if (tagName === 'img') textContent = element.alt || '';
    }
    if (!textContent) {
      textContent = (element.innerText || element.textContent || '').trim();
    }
    textContent = textContent.replace(/\s+/g, ' ').trim().substring(0, 100);
    const elementInfo = { tagName, selector, text: textContent };
    if (tagName === 'input' && element.type) elementInfo.type = element.type;
    const role = element.getAttribute('role');
    if (role) elementInfo.role = role;
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      if (typeof element.value !== 'undefined') elementInfo.value = element.value;
    }
    const name = element.getAttribute('name');
    if ((tagName === 'input' || tagName === 'textarea' || tagName === 'select') && name) {
      elementInfo.name = name;
    }
    if (elementInfo.tagName && elementInfo.selector && typeof elementInfo.text === 'string') {
      interactableElements.push(elementInfo);
    }
  });
  return interactableElements;
}

export async function findElementsOnPage() {
  try {
    const tab = await getCurrentTab();
    if (!tab || !tab.id) {
      throw new Error("Could not get active tab ID for finding elements.");
    }
    const elements = await executeScriptOnTab(tab.id, findAllInteractableElements);
    if (elements && Array.isArray(elements)) {
      return { success: true, elements: elements };
    } else {
      return { success: true, elements: [] };
    }
  } catch (error) {
    return { success: false, error: `Error finding elements: ${error.message}` };
  }
}