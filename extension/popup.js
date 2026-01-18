document.getElementById("run").addEventListener("click", async () => {
  showLoading();

  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    const url = tab.url;

    if (!url || !url.startsWith("http")) {
      showError("Open a public website (https://...)");
      return;
    }

    try {
      // NEW: Fetch sitemap URLs first
      const sitemapRes = await fetch("http://localhost:3000/fetch-sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const sitemapData = await sitemapRes.json();
      const urlsToAudit = sitemapData.urls || [url];

      // NEW: Log sitemap status
      if (!sitemapData.success) {
        console.log("Full site run not possible, running only current URL");
      } else {
        console.log(`Found ${urlsToAudit.length} URLs to audit`);
      }

      // NEW: Update loading message with URL count
      showLoadingWithCount(urlsToAudit.length);

      // NEW: Audit all URLs and aggregate results
      const allResults = await auditMultipleURLs(urlsToAudit, tab.id);

      // NEW: Calculate average scores
      const averageScores = calculateAverageScores(allResults);

      // NEW: Combine all accessibility issues
      const allIssues = combineAllIssues(allResults);

      const combined = {
        scores: averageScores,
        accessibilityIssues: allIssues
      };

      renderUI(combined);

    } catch (err) {
      console.error(err);
      showError("Audit failed");
    }
  });
});

// NEW: Audit multiple URLs
async function auditMultipleURLs(urls, tabId) {
  const results = [];

  for (let i = 0; i < urls.length; i++) {
    const currentUrl = urls[i];
    
    try {
      // Update progress
      updateProgress(i + 1, urls.length, currentUrl);

      // Run Lighthouse audit
      const lhRes = await fetch("http://localhost:3000/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: currentUrl })
      });

      const lighthouseData = await lhRes.json();

      // Run Axe audit only on the current tab URL (first URL)
      let axeIssues = [];
      if (i === 0) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["axe.min.js", "content.js"]
        });

        axeIssues = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, { action: "runAxe" }, (axeData) => {
            if (chrome.runtime.lastError || !axeData) {
              resolve([]);
            } else {
              resolve(axeData.axeIssues || []);
            }
          });
        });
      }

      results.push({
        url: currentUrl,
        scores: lighthouseData.scores,
        lighthouseIssues: lighthouseData.lighthouseAccessibilityIssues || [],
        axeIssues: axeIssues
      });

    } catch (err) {
      console.error(`Failed to audit ${currentUrl}:`, err);
    }
  }

  return results;
}

// NEW: Calculate average scores from all audits
function calculateAverageScores(results) {
  if (results.length === 0) {
    return { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 };
  }

  const totals = results.reduce((acc, result) => {
    acc.performance += result.scores.performance || 0;
    acc.accessibility += result.scores.accessibility || 0;
    acc.bestPractices += result.scores.bestPractices || 0;
    acc.seo += result.scores.seo || 0;
    return acc;
  }, { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 });

  const count = results.length;

  return {
    performance: Math.round(totals.performance / count),
    accessibility: Math.round(totals.accessibility / count),
    bestPractices: Math.round(totals.bestPractices / count),
    seo: Math.round(totals.seo / count)
  };
}

// NEW: Combine all accessibility issues from all URLs
function combineAllIssues(results) {
  const issuesMap = new Map();

  results.forEach(result => {
    // Add Lighthouse issues
    result.lighthouseIssues.forEach(issue => {
      const key = `lighthouse-${issue.id}`;
      if (!issuesMap.has(key)) {
        issuesMap.set(key, {
          source: "lighthouse",
          title: issue.title,
          count: 1
        });
      } else {
        issuesMap.get(key).count++;
      }
    });

    // Add Axe issues
    result.axeIssues.forEach(violation => {
      const key = `axe-${violation.id}`;
      if (!issuesMap.has(key)) {
        issuesMap.set(key, {
          source: "axe",
          title: violation.help,
          impact: violation.impact,
          count: 1
        });
      } else {
        issuesMap.get(key).count++;
      }
    });
  });

  return Array.from(issuesMap.values());
}

// NEW: Update progress during multi-URL audit
function updateProgress(current, total, currentUrl) {
  const scoresDiv = document.getElementById("scores");
  scoresDiv.innerHTML = `
    <div class="text-sm text-gray-400 text-center w-full">
      Auditing ${current} of ${total} pages...<br>
      <span class="text-xs text-gray-500 mt-1 block truncate">${currentUrl}</span>
    </div>
  `;
}

// NEW: Show loading with URL count
function showLoadingWithCount(count) {
  const scoresDiv = document.getElementById("scores");
  const issuesDiv = document.getElementById("issues");

  scoresDiv.innerHTML = `
    <div class="text-sm text-gray-400 text-center w-full">
      Found ${count} URL${count > 1 ? 's' : ''} to audit...
    </div>
  `;
  issuesDiv.innerHTML = "";
}

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
    // NEW: Show count if issue appears on multiple pages
    const countBadge = issue.count > 1 
      ? `<span class="text-xs text-gray-500 ml-1">(${issue.count} pages)</span>` 
      : '';

    issuesDiv.innerHTML += `
      <div class="border border-slate-800 rounded-lg p-2 bg-black/40">
        <div class="text-xs font-semibold ${
          issue.source === "axe" ? "text-violet-400" : "text-sky-400"
        }">
          ${issue.impact ? `(${issue.impact})` : ""}${countBadge}
        </div>
        <p class="text-sm mt-1">${issue.title}</p>
      </div>
    `;
  });
}