// content.js
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "runAxe") {
    if (!window.axe) {
      sendResponse({ error: "axe-core not loaded" });
      return;
    }

    axe.run(document, {}, (err, results) => {
      if (err) {
        sendResponse({ error: err.message });
        return;
      }

      const issues = results.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        nodes: v.nodes.length
      }));

      sendResponse({ axeIssues: issues });
    });

    return true; // keep message channel open
  }
});
