document.getElementById("run").addEventListener("click", async () => {
  const output = document.getElementById("output");
  output.textContent = "Running audit...";

  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    const url = tab.url;

    if (!url || !url.startsWith("http")) {
      output.textContent = "Open a public website (https://...)";
      return;
    }

    try {
      // 1️⃣ Inject axe + content script FORCEFULLY
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["axe.min.js", "content.js"]
      });

      // 2️⃣ Lighthouse backend
      const lhRes = await fetch("http://localhost:3000/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const lighthouseData = await lhRes.json();

      // 3️⃣ Run axe
      chrome.tabs.sendMessage(
        tab.id,
        { action: "runAxe" },
        (axeData) => {
          if (chrome.runtime.lastError) {
            output.textContent =
              "Axe failed: " + chrome.runtime.lastError.message;
            return;
          }

          const combined = {
            lighthouseScores: lighthouseData.scores,
            lighthouseAccessibilityIssues:
              lighthouseData.lighthouseAccessibilityIssues,
            axeAccessibilityIssues: axeData.axeIssues
          };

          output.textContent = JSON.stringify(combined, null, 2);
        }
      );

    } catch (err) {
      output.textContent = "Injection or backend failed";
      console.error(err);
    }
  });
});
