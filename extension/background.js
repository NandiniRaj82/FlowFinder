// =======================
// BACKGROUND SERVICE WORKER
// Handles cross-tab highlighting coordination
// =======================

// Store pending highlight requests for tabs being loaded
const pendingHighlights = new Map();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "highlightOnTab") {
    const { tabId, selector, url } = request;
    
    console.log(`[Background] Received highlight request for tab ${tabId}`);
    
    // Store the pending highlight
    pendingHighlights.set(tabId, { selector, url, timestamp: Date.now() });
    
    // Set up listener for when the tab finishes loading
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        console.log(`[Background] Tab ${tabId} loaded, executing highlight`);
        
        // Remove listener
        chrome.tabs.onUpdated.removeListener(listener);
        
        // Get the pending highlight data
        const highlightData = pendingHighlights.get(tabId);
        if (!highlightData) {
          console.log(`[Background] No highlight data found for tab ${tabId}`);
          return;
        }
        
        // Inject content script and highlight
        executeHighlightSequence(tabId, highlightData.selector);
        
        // Clean up
        pendingHighlights.delete(tabId);
      }
    };
    
    chrome.tabs.onUpdated.addListener(listener);
    
    // Cleanup listener after 20 seconds to prevent memory leaks
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      pendingHighlights.delete(tabId);
    }, 20000);
    
    sendResponse({ success: true });
    return true;
  }
  
  return false;
});

// Execute the highlight sequence: inject script, wait, then highlight
async function executeHighlightSequence(tabId, selector) {
  try {
    // Step 1: Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    });
    
    console.log(`[Background] Content script injected into tab ${tabId}`);
    
    // Step 2: Wait a bit for script to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 3: Send highlight message
    const response = await chrome.tabs.sendMessage(tabId, {
      action: "highlightElement",
      selector: selector
    });
    
    console.log(`[Background] Highlight response:`, response);
    
  } catch (error) {
    console.error(`[Background] Failed to highlight on tab ${tabId}:`, error);
  }
}

// Clean up old pending highlights periodically (every minute)
setInterval(() => {
  const now = Date.now();
  const timeout = 60000; // 1 minute
  
  for (const [tabId, data] of pendingHighlights.entries()) {
    if (now - data.timestamp > timeout) {
      console.log(`[Background] Cleaning up stale highlight for tab ${tabId}`);
      pendingHighlights.delete(tabId);
    }
  }
}, 60000);

chrome.action.onClicked.addListener((tab) => {
  console.log('[Background] Extension icon clicked');
});

console.log('[Background] Service worker initialized');