// Background service worker for Flow Finder
// Helps manage highlighting across tabs

let pendingHighlights = new Map();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "highlightOnTab") {
    const { tabId, selector, url } = request;
    
    console.log("Background received highlight request:", { tabId, selector, url });
    
    // Store pending highlight
    pendingHighlights.set(tabId, { selector, url, timestamp: Date.now() });
    
    // Try to highlight
    highlightElement(tabId, selector);
    
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === "tabLoaded") {
    const { tabId } = request;
    
    // Check if there's a pending highlight for this tab
    if (pendingHighlights.has(tabId)) {
      const { selector } = pendingHighlights.get(tabId);
      console.log("Tab loaded with pending highlight:", tabId);
      
      setTimeout(() => {
        highlightElement(tabId, selector);
        pendingHighlights.delete(tabId);
      }, 500);
    }
    
    return true;
  }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && pendingHighlights.has(tabId)) {
    const { selector } = pendingHighlights.get(tabId);
    console.log("Tab completed loading, highlighting:", tabId);
    
    setTimeout(() => {
      highlightElement(tabId, selector);
      pendingHighlights.delete(tabId);
    }, 800);
  }
});

// Function to inject and highlight
async function highlightElement(tabId, selector) {
  try {
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    });
    
    console.log("Content script injected into tab:", tabId);
    
    // Wait a bit for script to initialize
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Send highlight message
    chrome.tabs.sendMessage(tabId, {
      action: "highlightElement",
      selector: selector
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Highlight error:", chrome.runtime.lastError.message);
      } else {
        console.log("Highlight response:", response);
      }
    });
    
  } catch (error) {
    console.error("Failed to highlight element:", error);
  }
}

// Clean up old pending highlights (older than 30 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [tabId, data] of pendingHighlights.entries()) {
    if (now - data.timestamp > 30000) {
      pendingHighlights.delete(tabId);
    }
  }
}, 10000);