// =======================
// CONTENT SCRIPT
// Handles Axe testing and element highlighting
// =======================

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  // Check if Axe is available
  if (req.action === "checkAxe") {
    sendResponse({ available: typeof window.axe !== 'undefined' });
    return true;
  }

  // Run Axe accessibility tests
  if (req.action === "runAxe") {
    if (!window.axe) {
      sendResponse({ axeIssues: [] });
      return;
    }

    axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa"]
      }
    }).then(results => {
      sendResponse({ axeIssues: results.violations });
    }).catch(err => {
      console.error("Axe error", err);
      sendResponse({ axeIssues: [] });
    });

    return true;
  }

  // Handle element highlighting - IMPROVED
  if (req.action === "highlightElement") {
    const selector = req.selector;

    if (!selector) {
      sendResponse({ success: false, message: "No selector provided" });
      return;
    }

    try {
      console.log(`[Content] Attempting to highlight element:`, selector);
      
      // Remove any existing highlights first
      removeExistingHighlights();

      // Find the element using the selector
      let element = findElement(selector);

      if (!element) {
        console.error(`[Content] Element not found for selector:`, selector);
        sendResponse({ success: false, message: "Element not found" });
        return;
      }

      console.log(`[Content] Element found, highlighting...`);

      // Scroll element into view smoothly with center alignment
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'center'
      });

      // Wait a bit for scroll to complete, then highlight
      setTimeout(() => {
        addHighlightOverlay(element);
        sendResponse({ success: true });
      }, 300);

    } catch (err) {
      console.error("[Content] Highlight error:", err);
      sendResponse({ success: false, message: err.message });
    }

    return true; // Keep message channel open for async response
  }
});

// Smart element finder that handles both string and array selectors
function findElement(selector) {
  try {
    // Handle array selectors (used by Axe for shadow DOM support)
    if (Array.isArray(selector)) {
      // For now, just use the first selector
      // In the future, this could traverse shadow DOM
      return document.querySelector(selector[0]);
    }
    
    // Handle string selectors
    if (typeof selector === 'string') {
      return document.querySelector(selector);
    }
    
    return null;
  } catch (error) {
    console.error('[Content] Error finding element:', error);
    return null;
  }
}

// Remove existing highlight overlays and classes
function removeExistingHighlights() {
  // Remove overlay elements
  const existingOverlays = document.querySelectorAll('.flow-finder-highlight-overlay');
  existingOverlays.forEach(overlay => overlay.remove());

  // Remove highlight classes
  const existingHighlights = document.querySelectorAll('.flow-finder-highlighted');
  existingHighlights.forEach(el => el.classList.remove('flow-finder-highlighted'));
  
  console.log('[Content] Removed existing highlights');
}

// Add visual highlight overlay to element - IMPROVED
function addHighlightOverlay(element) {
  // Add class to element for outline
  element.classList.add('flow-finder-highlighted');

  // Get element position
  const rect = element.getBoundingClientRect();

  // Create overlay div with improved styling
  const overlay = document.createElement('div');
  overlay.className = 'flow-finder-highlight-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border: 3px solid #ef4444;
    background: rgba(239, 68, 68, 0.15);
    pointer-events: none;
    z-index: 2147483647;
    box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.3), 
                0 0 20px rgba(239, 68, 68, 0.4),
                inset 0 0 20px rgba(239, 68, 68, 0.2);
    animation: flow-finder-pulse 1.5s ease-in-out infinite;
    border-radius: 4px;
  `;

  // Inject animation styles if not already present
  if (!document.getElementById('flow-finder-highlight-styles')) {
    const style = document.createElement('style');
    style.id = 'flow-finder-highlight-styles';
    style.textContent = `
      @keyframes flow-finder-pulse {
        0%, 100% {
          box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.3), 
                      0 0 20px rgba(239, 68, 68, 0.4),
                      inset 0 0 20px rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
        }
        50% {
          box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.4), 
                      0 0 35px rgba(239, 68, 68, 0.6),
                      inset 0 0 30px rgba(239, 68, 68, 0.3);
          border-color: #dc2626;
        }
      }
      .flow-finder-highlighted {
        outline: 3px dashed #ef4444 !important;
        outline-offset: 3px !important;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);
  
  console.log('[Content] Highlight overlay added');

  // Auto-fade and remove after 6 seconds
  setTimeout(() => {
    overlay.style.transition = 'opacity 0.8s ease-out';
    overlay.style.opacity = '0';
    element.classList.remove('flow-finder-highlighted');
    
    setTimeout(() => {
      overlay.remove();
      console.log('[Content] Highlight overlay removed');
    }, 800);
  }, 6000);

  // Update overlay position on scroll/resize
  const updateOverlayPosition = () => {
    const newRect = element.getBoundingClientRect();
    overlay.style.top = `${newRect.top}px`;
    overlay.style.left = `${newRect.left}px`;
    overlay.style.width = `${newRect.width}px`;
    overlay.style.height = `${newRect.height}px`;
  };

  window.addEventListener('scroll', updateOverlayPosition, { passive: true });
  window.addEventListener('resize', updateOverlayPosition, { passive: true });

  // Clean up event listeners
  setTimeout(() => {
    window.removeEventListener('scroll', updateOverlayPosition);
    window.removeEventListener('resize', updateOverlayPosition);
  }, 7000);
}

console.log('[Content] Content script loaded');


// =======================
// postMessage Relay — ADDED FOR FLOW FINDER WEB APP
// Allows the Next.js web app (running in a normal browser tab) to reach
// the background service worker through this content script.
// Web app sends postMessage → content script forwards to background
// → background responds → content script relays response back to web app.
// =======================

window.addEventListener('message', (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;
  if (event.data?.from !== 'FLOW_FINDER_WEB') return;

  const { requestId, payload } = event.data;

  console.log('[Content] Relaying message to background:', payload?.action);

  chrome.runtime.sendMessage(payload, (response) => {
    window.postMessage(
      { from: 'FLOW_FINDER_EXT', requestId, response },
      '*'
    );
  });
});


// =======================
// Inject stored errors onto window — ADDED FOR FLOW FINDER WEB APP
// Exposes errors stored by the extension onto window.__flowFinderErrors
// so the web app can read them directly as a fallback (no messaging needed).
// =======================

chrome.storage.local.get('accessibilityErrors', (result) => {
  const allErrors = result.accessibilityErrors || {};

  // Flatten all tabs' errors into one array
  const flat = Object.values(allErrors).flatMap(entry => entry.errors || []);

  if (flat.length > 0) {
    window.__flowFinderErrors = flat;
    console.log('[Content] Injected', flat.length, 'errors onto window.__flowFinderErrors');
  }
});