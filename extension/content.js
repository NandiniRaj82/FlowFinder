function injectAxeAndPageScript() {
  return new Promise((resolve) => {
    // Avoid injecting multiple times
    if (document.getElementById("__axe_injected")) {
      resolve();
      return;
    }

    // Inject axe-core
    const axeScript = document.createElement("script");
    axeScript.src = chrome.runtime.getURL("axe.min.js");
    axeScript.id = "__axe_injected";

    // Inject page script (bridge between page & content script)
    const pageScript = document.createElement("script");
    pageScript.src = chrome.runtime.getURL("page-script.js");
    pageScript.id = "__axe_page_script";

    // Append both to the page
    document.documentElement.appendChild(axeScript);
    document.documentElement.appendChild(pageScript);

    // Resolve after axe loads
    axeScript.onload = () => {
      resolve();
    };
  });
}

function runAccessibility() {
  return new Promise(async (resolve) => {
    await injectAxeAndPageScript();

    // Ask page context to run axe
    window.postMessage({ type: "RUN_AXE" }, "*");

    // Listen for result from page-script.js
    function handler(event) {
      if (event.data && event.data.type === "AXE_RESULT") {
        window.removeEventListener("message", handler);
        resolve(event.data.results);
      }
    }

    window.addEventListener("message", handler);
  });
}

// Listen for popup message
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "runAnalyzers") {
    runAccessibility().then((results) => {
      sendResponse(results);
    });

    return true; // VERY IMPORTANT (keeps channel open)
  }
});
