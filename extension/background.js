// =======================
// BACKGROUND SERVICE WORKER
// Handles cross-tab highlighting coordination
// Using chrome.storage.local for persistent error storage
// =======================

// Listen for messages from popup / content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // ── Store accessibility errors from the scanner ──────────────────────────
  if (request.action === "storeAccessibilityErrors") {

    const { errors, url, tabId } = request;

    console.log(`[Background] Storing ${errors.length} accessibility errors for tab ${tabId}`);

    // Read existing stored errors, then merge / overwrite for this tab
    chrome.storage.local.get("accessibilityErrors", (result) => {

      const allErrors = result.accessibilityErrors || {};

      allErrors[tabId] = {
        errors:    errors,
        url:       url,
        tabId:     tabId,
        timestamp: Date.now()
      };

      chrome.storage.local.set({ accessibilityErrors: allErrors }, () => {
        console.log(`[Background] Errors saved for tab ${tabId} (${errors.length} errors)`);
        sendResponse({ success: true, count: errors.length });
      });

    });

    return true; // async response
  }

  // ── Retrieve errors for a specific tab ───────────────────────────────────
  if (request.action === "getAccessibilityErrors") {

    const { tabId } = request;

    chrome.storage.local.get("accessibilityErrors", (result) => {

      const allErrors = result.accessibilityErrors || {};
      const tabErrors = allErrors[tabId] || null;

      console.log(`[Background] Fetching errors for tab ${tabId}:`, tabErrors ? tabErrors.errors.length : 0);

      sendResponse({ success: true, data: tabErrors });

    });

    return true;
  }

  // ── Retrieve ALL stored errors (across all tabs) ──────────────────────────
  if (request.action === "getAllAccessibilityErrors") {

    chrome.storage.local.get("accessibilityErrors", (result) => {

      const allErrors = result.accessibilityErrors || {};

      // Flatten into a single array, newest first
      const flat = Object.values(allErrors)
        .sort((a, b) => b.timestamp - a.timestamp)
        .flatMap(entry => entry.errors.map(err => ({ ...err, sourceUrl: entry.url, tabId: entry.tabId })));

      console.log(`[Background] Returning all errors: ${flat.length} total`);

      sendResponse({ success: true, errors: flat, entries: allErrors });

    });

    return true;
  }

  // ── Clear errors for a specific tab ──────────────────────────────────────
  if (request.action === "clearAccessibilityErrors") {

    const { tabId } = request;

    chrome.storage.local.get("accessibilityErrors", (result) => {

      const allErrors = result.accessibilityErrors || {};
      delete allErrors[tabId];

      chrome.storage.local.set({ accessibilityErrors: allErrors }, () => {
        console.log(`[Background] Cleared errors for tab ${tabId}`);
        sendResponse({ success: true });
      });

    });

    return true;
  }

  // ── Highlight element on tab ──────────────────────────────────────────────
  if (request.action === "highlightOnTab") {

    const { tabId, selector, url } = request;

    console.log(`[Background] Received highlight request for tab ${tabId}`);

    // Store highlight temporarily in session storage
    chrome.storage.session.set({
      [tabId]: {
        selector:  selector,
        url:       url,
        timestamp: Date.now()
      }
    });

    const listener = (updatedTabId, changeInfo) => {

      if (updatedTabId === tabId && changeInfo.status === "complete") {

        console.log(`[Background] Tab ${tabId} loaded, executing highlight`);
        chrome.tabs.onUpdated.removeListener(listener);

        chrome.storage.session.get(String(tabId), (result) => {

          const highlightData = result[tabId];
          if (!highlightData) return;

          executeHighlightSequence(tabId, highlightData.selector);
          chrome.storage.session.remove(String(tabId));

        });
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // Safety cleanup after 20 s
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.storage.session.remove(String(tabId));
    }, 20000);

    sendResponse({ success: true });
    return true;
  }

  return false;
});


// =======================
// Highlight Execution
// =======================

async function executeHighlightSequence(tabId, selector) {

  try {

    await chrome.scripting.executeScript({
      target: { tabId },
      files:  ["content.js"]
    });

    console.log(`[Background] Content script injected into tab ${tabId}`);

    await new Promise(resolve => setTimeout(resolve, 500));

    const response = await chrome.tabs.sendMessage(tabId, {
      action:   "highlightElement",
      selector: selector
    });

    console.log(`[Background] Highlight response:`, response);

  } catch (error) {
    console.error(`[Background] Failed to highlight on tab ${tabId}:`, error);
  }
}


// =======================
// Periodic cleanup of stale errors (older than 24 h)
// =======================

function cleanupStaleErrors() {

  chrome.storage.local.get("accessibilityErrors", (result) => {

    const allErrors = result.accessibilityErrors || {};
    const now       = Date.now();
    const maxAge    = 24 * 60 * 60 * 1000; // 24 hours
    let   changed   = false;

    for (const tabId in allErrors) {
      if (now - allErrors[tabId].timestamp > maxAge) {
        console.log(`[Background] Removing stale errors for tab ${tabId}`);
        delete allErrors[tabId];
        changed = true;
      }
    }

    if (changed) {
      chrome.storage.local.set({ accessibilityErrors: allErrors });
    }

  });
}

// Run cleanup every hour
setInterval(cleanupStaleErrors, 60 * 60 * 1000);

// Also clean up stale session highlights every minute
setInterval(() => {

  chrome.storage.session.get(null, (items) => {

    const now     = Date.now();
    const timeout = 60000;

    for (const key in items) {
      const data = items[key];
      if (data.timestamp && now - data.timestamp > timeout) {
        console.log(`[Background] Cleaning up stale highlight for tab ${key}`);
        chrome.storage.session.remove(key);
      }
    }
  });

}, 60000);


// =======================
// Extension icon click
// =======================

chrome.action.onClicked.addListener((tab) => {
  console.log("[Background] Extension icon clicked on tab:", tab.id);
});


console.log("[Background] Service worker initialized");