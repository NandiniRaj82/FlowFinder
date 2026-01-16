chrome.runtime.onMessage.addListener((req,sender, sendResponse) => {
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
});
