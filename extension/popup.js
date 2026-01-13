document.getElementById("run").addEventListener("click", async () => {
  showLoading();

  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    const url = tab.url;

    if (!url || !url.startsWith("http")) {
      showError("Open a public website (https://...)");
      return;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["axe.min.js", "content.js"]
      });

      const lhRes = await fetch("http://localhost:3000/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const lighthouseData = await lhRes.json();

      chrome.tabs.sendMessage(tab.id, { action: "runAxe" }, (axeData) => {
        if (chrome.runtime.lastError) {
          showError("Axe failed: " + chrome.runtime.lastError.message);
          return;
        }

        const lighthouseIssues =
          (lighthouseData.lighthouseAccessibilityIssues || []).map(i => ({
            source: "lighthouse",
            title: i.title
          }));

        const axeIssues =
          (axeData.axeIssues || []).map(v => ({
            source: "axe",
            title: v.help,
            impact: v.impact
          }));

        const combined = {
          scores: lighthouseData.scores,
          accessibilityIssues: [...lighthouseIssues, ...axeIssues]
        };

        console.log("AXE RAW:", axeData);
        renderUI(combined);
      });

    } catch (err) {
      console.error(err);
      showError("Audit failed");
    }
  });
});


function showLoading() {
  const scoresDiv = document.getElementById("scores");
  const issuesDiv = document.getElementById("issues");

  scoresDiv.innerHTML = `
    <div class="text-sm text-gray-400 text-center w-full">
      Running audit...
    </div>
  `;
  issuesDiv.innerHTML = "";
}

function showError(message) {
  document.getElementById("scores").innerHTML = "";
  document.getElementById("issues").innerHTML = `
    <p class="text-sm text-red-400 text-center">${message}</p>
  `;
}


function renderUI(data) {
  const scoresDiv = document.getElementById("scores");
  const issuesDiv = document.getElementById("issues");

  scoresDiv.innerHTML = "";
  issuesDiv.innerHTML = "";

  const scoreMap = [
    ["performance", "Perf"],
    ["accessibility", "Acc"],
    ["bestPractices", "Best"],
    ["seo", "SEO"]
  ];

  scoreMap.forEach(([key, label]) => {
    const score = data.scores[key];
    const color =
      score >= 90 ? "text-green-400" :
      score >= 70 ? "text-yellow-400" :
      "text-red-400";

    scoresDiv.innerHTML += `
      <div class="flex flex-col items-center">
        <div class="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold ${color}">
          ${score}
        </div>
        <span class="text-xs mt-1 text-gray-400">${label}</span>
      </div>
    `;
  });

  if (!data.accessibilityIssues.length) {
    issuesDiv.innerHTML = `
      <p class="text-center text-sm text-gray-400">
        No accessibility issues found 
      </p>
    `;
    return;
  }

  data.accessibilityIssues.forEach(issue => {
    issuesDiv.innerHTML += `
      <div class="border border-slate-800 rounded-lg p-2 bg-black/40">
        <div class="text-xs font-semibold ${
          issue.source === "axe" ? "text-violet-400" : "text-sky-400"
        }">
          ${issue.source === "axe" ? "🟪 AXE" : "🟦 Lighthouse"}
          ${issue.impact ? `(${issue.impact})` : ""}
        </div>
        <p class="text-sm mt-1">${issue.title}</p>
      </div>
    `;
  });
}
