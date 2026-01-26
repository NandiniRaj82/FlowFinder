chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  // NEW: Check if Axe is available
  if (req.action === "checkAxe") {
    sendResponse({ available: typeof window.axe !== 'undefined' });
    return true;
  }

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

  // Handle element highlighting
  if (req.action === "highlightElement") {
    const selector = req.selector;

    if (!selector) {
      sendResponse({ success: false, message: "No selector provided" });
      return;
    }

    try {
      // Remove any existing highlights
      removeExistingHighlights();

      // Find the element using the selector (can be string or array)
      let element;
      if (Array.isArray(selector)) {
        // Axe uses array selectors for shadow DOM support
        element = document.querySelector(selector[0]);
      } else {
        element = document.querySelector(selector);
      }

      if (!element) {
        sendResponse({ success: false, message: "Element not found" });
        return;
      }

      // Scroll element into view smoothly
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'center'
      });

      // Add highlight overlay
      addHighlightOverlay(element);

      sendResponse({ success: true });

    } catch (err) {
      console.error("Highlight error:", err);
      sendResponse({ success: false, message: err.message });
    }

    return true;
  }
});

// Remove existing highlight overlays
function removeExistingHighlights() {
  const existingOverlays = document.querySelectorAll('.flow-finder-highlight-overlay');
  existingOverlays.forEach(overlay => overlay.remove());

  const existingHighlights = document.querySelectorAll('.flow-finder-highlighted');
  existingHighlights.forEach(el => el.classList.remove('flow-finder-highlighted'));
}

// Add visual highlight overlay to element
function addHighlightOverlay(element) {
  // Add class to element
  element.classList.add('flow-finder-highlighted');

  // Get element position
  const rect = element.getBoundingClientRect();

  // Create overlay div
  const overlay = document.createElement('div');
  overlay.className = 'flow-finder-highlight-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border: 3px solid #ef4444;
    background: rgba(239, 68, 68, 0.1);
    pointer-events: none;
    z-index: 999999;
    box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2), 0 0 20px rgba(239, 68, 68, 0.3);
    animation: flow-finder-pulse 1.5s ease-in-out infinite;
    border-radius: 4px;
  `;

  // Add animation keyframes if not already added
  if (!document.getElementById('flow-finder-highlight-styles')) {
    const style = document.createElement('style');
    style.id = 'flow-finder-highlight-styles';
    style.textContent = `
      @keyframes flow-finder-pulse {
        0%, 100% {
          box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2), 0 0 20px rgba(239, 68, 68, 0.3);
        }
        50% {
          box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.3), 0 0 30px rgba(239, 68, 68, 0.5);
        }
      }
      .flow-finder-highlighted {
        outline: 2px dashed #ef4444 !important;
        outline-offset: 2px !important;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.style.transition = 'opacity 0.5s ease-out';
    overlay.style.opacity = '0';
    element.classList.remove('flow-finder-highlighted');
    
    setTimeout(() => {
      overlay.remove();
    }, 500);
  }, 5000);

  // Update overlay position on scroll
  const updateOverlayPosition = () => {
    const newRect = element.getBoundingClientRect();
    overlay.style.top = `${newRect.top}px`;
    overlay.style.left = `${newRect.left}px`;
  };

  window.addEventListener('scroll', updateOverlayPosition);
  window.addEventListener('resize', updateOverlayPosition);

  // Clean up event listeners
  setTimeout(() => {
    window.removeEventListener('scroll', updateOverlayPosition);
    window.removeEventListener('resize', updateOverlayPosition);
  }, 5500);
}