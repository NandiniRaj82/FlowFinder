// =======================
// GLOBAL STATE
// =======================
let availableUrls = [];
let pageSelectorExpanded = true;
let lastAuditResults = null;

// =======================
// INIT
// =======================
document.addEventListener("DOMContentLoaded", () => {
  const radios = document.querySelectorAll('input[name="audit-mode"]');
  const containers = document.querySelectorAll('[data-mode]');

  radios.forEach(r => r.addEventListener("change", handleModeChange));

  containers.forEach(box => {
    box.addEventListener("click", e => {
      if (e.target.tagName !== "INPUT") {
        box.querySelector("input").checked = true;
        handleModeChange();
      }
    });
  });
  
  // Restore previous audit results if available
  restoreAuditResults();
});

// =======================
// MODE CHANGE HANDLER
// =======================
function handleModeChange() {
  const mode = document.querySelector('input[name="audit-mode"]:checked').value;
  const selector = document.getElementById("page-selector");
  const list = document.getElementById("page-list");
  const search = document.getElementById("page-search");

  if (mode === "select") {
    selector.classList.remove("hidden");

    if (availableUrls.length === 0) {
      fetchSitemapForSelection();
    }
  } else {
    // FULL RESET
    selector.classList.add("hidden");
    list.innerHTML = "";
    availableUrls = [];
    pageSelectorExpanded = true;

    if (search) search.value = "";
    document.getElementById("selected-count").textContent = "0";
  }
}

// =======================
// FETCH SITEMAP
// =======================
async function fetchSitemapForSelection() {
  const list = document.getElementById("page-list");

  list.innerHTML =
    '<div class="text-xs text-gray-400 text-center py-2">Loading pages...</div>';

  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    try {
      const res = await fetch("http://localhost:3000/fetch-sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: tab.url })
      });

      const data = await res.json();
      availableUrls = data.urls || [tab.url];
      renderPageList(availableUrls);

    } catch (e) {
      list.innerHTML =
        '<div class="text-xs text-red-400 text-center py-2">Failed to load pages</div>';
    }
  });
}

// =======================
// RENDER PAGE LIST
// =======================
function renderPageList(urls) {
  const selector = document.getElementById("page-selector");
  const list = document.getElementById("page-list");

  list.innerHTML = "";

  // REMOVE OLD TOGGLE (important fix)
  const oldToggle = document.getElementById("page-toggle");
  if (oldToggle) oldToggle.remove();

  // TOGGLE HEADER
  const toggle = document.createElement("div");
  toggle.id = "page-toggle";
  toggle.className = "flex items-center justify-between mb-2";
  toggle.innerHTML = `
    <span class="text-xs text-gray-400">Pages to audit:</span>
    <button class="text-xs text-indigo-400 hover:text-indigo-300">
      ▲ Hide
    </button>
  `;
  selector.insertBefore(toggle, list);

  const toggleBtn = toggle.querySelector("button");
  const listContainer = list;

  toggleBtn.addEventListener("click", () => {
    pageSelectorExpanded = !pageSelectorExpanded;
    listContainer.classList.toggle("hidden", !pageSelectorExpanded);
    toggleBtn.textContent = pageSelectorExpanded ? "▲ Hide" : "▼ Show";
  });

  // SELECT ALL
  const selectAll = document.createElement("div");
  selectAll.className =
    "flex items-center gap-2 p-2 rounded bg-slate-800/50 cursor-pointer";
  selectAll.innerHTML = `
    <input type="checkbox" id="select-all">
    <label class="text-xs font-semibold text-indigo-400">
      Select All (${urls.length})
    </label>
  `;
  list.appendChild(selectAll);

  selectAll.querySelector("input").addEventListener("change", e => {
    list.querySelectorAll(".page-checkbox").forEach(cb => {
      cb.checked = e.target.checked;
    });
    updateSelectedCount();
  });

  // URL ITEMS
  urls.forEach((url, i) => {
    const div = document.createElement("div");
    div.className =
      "flex items-center gap-2 p-2 rounded bg-black/40 hover:bg-slate-800";

    const path = new URL(url).pathname || "Home";

    div.innerHTML = `
      <input type="checkbox" class="page-checkbox" value="${url}">
      <label class="text-xs truncate">${path === "/" ? "Home" : path}</label>
    `;

    div.querySelector("input").addEventListener("change", updateSelectedCount);
    list.appendChild(div);
  });

  initializeSearch();
  updateSelectedCount();
}

// =======================
// SEARCH
// =======================
function initializeSearch() {
  const input = document.getElementById("page-search");
  const items = document.querySelectorAll("#page-list > div");

  input.oninput = () => {
    const q = input.value.toLowerCase();
    items.forEach((item, i) => {
      if (i === 0) return;
      item.classList.toggle(
        "hidden",
        !item.textContent.toLowerCase().includes(q)
      );
    });
  };
}

// =======================
// COUNT
// =======================
function updateSelectedCount() {
  document.getElementById("selected-count").textContent =
    document.querySelectorAll(".page-checkbox:checked").length;
}

// Get selected URLs based on mode
function getUrlsToAudit(allUrls, currentUrl) {
  const selectedMode = document.querySelector('input[name="audit-mode"]:checked').value;
  
  if (selectedMode === 'current') {
    return [currentUrl];
  } else if (selectedMode === 'select') {
    const selectedCheckboxes = document.querySelectorAll('.page-checkbox:checked');
    const selectedUrls = Array.from(selectedCheckboxes).map(cb => cb.value);
    return selectedUrls.length > 0 ? selectedUrls : [currentUrl];
  } else {
    // full mode
    return allUrls;
  }
}

document.getElementById("run").addEventListener("click", async () => {
  showLoading();

  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    const url = tab.url;

    if (!url || !url.startsWith("http")) {
      showError("Open a public website (https://...)");
      return;
    }

    try {
      const selectedMode = document.querySelector('input[name="audit-mode"]:checked').value;
      let urlsToAudit = [url];

      // Fetch sitemap only if not in "current" mode
      if (selectedMode !== 'current') {
        const sitemapRes = await fetch("http://localhost:3000/fetch-sitemap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });

        const sitemapData = await sitemapRes.json();
        const allUrls = sitemapData.urls || [url];

        if (!sitemapData.success) {
          console.log("Full site run not possible, running only current URL");
        } else {
          console.log(`Found ${allUrls.length} URLs from sitemap`);
        }

        urlsToAudit = getUrlsToAudit(allUrls, url);
      }

      console.log(`Auditing ${urlsToAudit.length} URL(s)`);
      showLoadingWithCount(urlsToAudit.length);

      const allResults = await auditMultipleURLs(urlsToAudit, tab.id);
      const averageScores = calculateAverageScores(allResults);
      const allIssues = combineAllIssues(allResults);

      const combined = {
        scores: averageScores,
        accessibilityIssues: allIssues
      };

      renderUI(combined);
      saveAuditResults(combined);

    } catch (err) {
      console.error(err);
      showError("Audit failed");
    }
  });
});

async function auditMultipleURLs(urls, tabId) {
  const results = [];
  let axeAvailable = false;

  // Check if Axe is available on first URL
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["axe.min.js", "content.js"]
    });

    const axeCheck = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: "checkAxe" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve(false);
        } else {
          resolve(response.available || false);
        }
      });
    });

    axeAvailable = axeCheck;
    console.log(`Axe Core ${axeAvailable ? 'is' : 'is NOT'} available`);
  } catch (err) {
    console.error("Failed to check Axe availability:", err);
    axeAvailable = false;
  }

  for (let i = 0; i < urls.length; i++) {
    const currentUrl = urls[i];
    
    try {
      updateProgress(i + 1, urls.length, currentUrl);

      const lhRes = await fetch("http://localhost:3000/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: currentUrl })
      });

      const lighthouseData = await lhRes.json();

      let axeIssues = [];
      // Only run Axe on first URL and if it's available
      if (i === 0 && axeAvailable) {
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

function combineAllIssues(results) {
  const issuesMap = new Map();

  results.forEach(result => {
    result.lighthouseIssues.forEach(issue => {
      const key = `lighthouse-${issue.id}`;
      if (!issuesMap.has(key)) {
        issuesMap.set(key, {
          source: "lighthouse",
          title: issue.title,
          count: 1,
          selector: issue.selector || null,
          pages: [result.url]
        });
      } else {
        const existing = issuesMap.get(key);
        existing.count++;
        existing.pages.push(result.url);
      }
    });

    result.axeIssues.forEach(violation => {
      const key = `axe-${violation.id}`;
      if (!issuesMap.has(key)) {
        issuesMap.set(key, {
          source: "axe",
          title: violation.help,
          impact: violation.impact,
          count: 1,
          selector: violation.nodes && violation.nodes[0] ? violation.nodes[0].target : null,
          pages: [result.url]
        });
      } else {
        const existing = issuesMap.get(key);
        existing.count++;
        existing.pages.push(result.url);
      }
    });
  });

  return Array.from(issuesMap.values());
}

function updateProgress(current, total, currentUrl) {
  const scoresDiv = document.getElementById("scores");
  scoresDiv.innerHTML = `
    <div class="text-sm text-gray-400 text-center w-full">
      Auditing ${current} of ${total} pages...<br>
      <span class="text-xs text-gray-500 mt-1 block truncate">${currentUrl}</span>
    </div>
  `;
}

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
        No accessibility issues found ✓
      </p>
    `;
    return;
  }

  data.accessibilityIssues.forEach((issue, index) => {
    const issueDiv = document.createElement('div');
    issueDiv.className = 'border border-slate-800 rounded-lg p-2 bg-black/40';
    
    // Issue header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex items-center justify-between mb-1';
    
    // Only show impact if it exists (for axe issues)
    if (issue.impact) {
      const impactSpan = document.createElement('span');
      impactSpan.className = 'text-xs font-semibold text-violet-400';
      impactSpan.textContent = `Impact: ${issue.impact}`;
      headerDiv.appendChild(impactSpan);
    }
    
    // Title
    const titleP = document.createElement('p');
    titleP.className = 'text-sm mt-1';
    titleP.textContent = issue.title;
    
    if (issue.impact) {
      issueDiv.appendChild(headerDiv);
    }
    issueDiv.appendChild(titleP);
    
    // Show pages affected with improved navigation
    if (issue.pages && issue.pages.length > 0) {
      const pagesDiv = document.createElement('div');
      pagesDiv.className = 'mt-2 pt-2 border-t border-slate-700';
      
      if (issue.pages.length === 1) {
        // Single page - show directly with view button
        const pageItem = document.createElement('div');
        pageItem.className = 'flex items-center gap-2';
        
        const urlObj = new URL(issue.pages[0]);
        const displayPath = urlObj.pathname === '/' ? 'Home' : urlObj.pathname;
        
        const pathSpan = document.createElement('span');
        pathSpan.className = 'text-xs text-gray-300 flex-1 truncate';
        pathSpan.textContent = displayPath;
        pathSpan.title = issue.pages[0];
        
        const viewBtn = document.createElement('button');
        viewBtn.className = 'text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700';
        viewBtn.innerHTML = '👁️ View';
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          highlightElementOnPage(issue.selector, issue.pages[0]);
        });
        
        pageItem.appendChild(pathSpan);
        pageItem.appendChild(viewBtn);
        pagesDiv.appendChild(pageItem);
      } else {
        // Multiple pages - create dropdown
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'relative';
        
        const dropdownButton = document.createElement('button');
        dropdownButton.className = 'w-full flex items-center justify-between px-3 py-2 text-xs bg-slate-800 rounded-lg hover:bg-slate-700 text-gray-300';
        dropdownButton.innerHTML = `
          <span>Found on ${issue.pages.length} pages</span>
          <span class="dropdown-arrow">▼</span>
        `;
        
        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'hidden mt-1 bg-slate-800 rounded-lg border border-slate-700 max-h-[150px] overflow-y-auto';
        dropdownMenu.style.position = 'relative';
        dropdownMenu.style.zIndex = '10';
        
        issue.pages.forEach(pageUrl => {
          const menuItem = document.createElement('div');
          menuItem.className = 'flex items-center gap-2 px-3 py-2 hover:bg-slate-700 border-b border-slate-700 last:border-b-0';
          
          const urlObj = new URL(pageUrl);
          const displayPath = urlObj.pathname === '/' ? 'Home' : urlObj.pathname;
          
          const pathSpan = document.createElement('span');
          pathSpan.className = 'text-xs text-gray-300 flex-1 truncate';
          pathSpan.textContent = displayPath;
          pathSpan.title = pageUrl;
          
          const viewBtn = document.createElement('button');
          viewBtn.className = 'text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded bg-slate-900 hover:bg-slate-600 shrink-0';
          viewBtn.innerHTML = '👁️ View';
          viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            highlightElementOnPage(issue.selector, pageUrl);
          });
          
          menuItem.appendChild(pathSpan);
          menuItem.appendChild(viewBtn);
          dropdownMenu.appendChild(menuItem);
        });
        
        // Toggle dropdown
        let isOpen = false;
        dropdownButton.addEventListener('click', () => {
          isOpen = !isOpen;
          dropdownMenu.classList.toggle('hidden', !isOpen);
          dropdownButton.querySelector('.dropdown-arrow').textContent = isOpen ? '▲' : '▼';
        });
        
        dropdownContainer.appendChild(dropdownButton);
        dropdownContainer.appendChild(dropdownMenu);
        pagesDiv.appendChild(dropdownContainer);
      }
      
      issueDiv.appendChild(pagesDiv);
    }
    
    issuesDiv.appendChild(issueDiv);
  });
}

// =======================
// IMPROVED HIGHLIGHT NAVIGATION
// =======================
function highlightElementOnPage(selector, targetUrl) {
  if (!selector) {
    console.log('[Popup] No selector provided, skipping highlight');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, ([currentTab]) => {
    if (!currentTab) {
      console.error('[Popup] No active tab found');
      return;
    }

    // Normalize URLs for comparison (remove trailing slashes, hash, query params)
    const normalizeUrl = (url) => {
      try {
        const urlObj = new URL(url);
        // Remove hash and query params for comparison
        urlObj.hash = '';
        urlObj.search = '';
        // Remove trailing slash
        return urlObj.toString().replace(/\/$/, '');
      } catch (e) {
        return url;
      }
    };

    const currentUrl = normalizeUrl(currentTab.url);
    const targetNormalized = normalizeUrl(targetUrl);
    
    console.log('[Popup] Comparing URLs:', { current: currentUrl, target: targetNormalized });
    
    if (currentUrl === targetNormalized) {
      // ===== SAME TAB NAVIGATION =====
      console.log('[Popup] Same page detected - highlighting in current tab');
      
      // Inject content script and highlight immediately
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ["content.js"]
      }).then(() => {
        // Small delay to ensure script is ready
        return new Promise(resolve => setTimeout(resolve, 200));
      }).then(() => {
        // Send highlight message
        return chrome.tabs.sendMessage(currentTab.id, {
          action: "highlightElement",
          selector: selector
        });
      }).then((response) => {
        if (response && response.success) {
          console.log('[Popup] Element highlighted successfully');
        } else {
          console.warn('[Popup] Highlight failed:', response);
        }
      }).catch((error) => {
        console.error('[Popup] Failed to highlight element:', error);
      });
      
    } else {
      // ===== CROSS-TAB NAVIGATION =====
      console.log('[Popup] Different page detected - opening new tab');
      
      // Open new tab with target URL
      chrome.tabs.create({ 
        url: targetUrl, 
        active: true // Make it the active tab so user sees it
      }, (newTab) => {
        console.log('[Popup] New tab created:', newTab.id);
        
        // Send message to background script to handle highlighting when page loads
        chrome.runtime.sendMessage({
          action: "highlightOnTab",
          tabId: newTab.id,
          selector: selector,
          url: targetUrl
        }).then(() => {
          console.log('[Popup] Highlight request sent to background');
        }).catch((error) => {
          console.error('[Popup] Failed to send highlight request:', error);
        });
      });
    }
  });
}

// =======================
// STATE PERSISTENCE
// =======================
function saveAuditResults(results) {
  lastAuditResults = results;
  
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.set({ 
        lastAuditResults: results,
        lastAuditTimestamp: Date.now()
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('[Popup] Failed to save results:', chrome.runtime.lastError);
        } else {
          console.log('[Popup] Audit results saved to storage');
        }
      });
    } catch (error) {
      console.error('[Popup] Storage error:', error);
    }
  }
}

function restoreAuditResults() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    console.log('[Popup] Chrome storage not available');
    return;
  }
  
  try {
    chrome.storage.local.get(['lastAuditResults', 'lastAuditTimestamp'], (data) => {
      if (chrome.runtime.lastError) {
        console.error('[Popup] Failed to restore results:', chrome.runtime.lastError);
        return;
      }
      
      if (data.lastAuditResults && data.lastAuditTimestamp) {
        // Only restore if less than 30 minutes old
        const age = Date.now() - data.lastAuditTimestamp;
        const maxAge = 30 * 60 * 1000; // 30 minutes
        
        if (age < maxAge) {
          console.log('[Popup] Restoring previous audit results');
          lastAuditResults = data.lastAuditResults;
          renderUI(data.lastAuditResults);
          
          // Show info banner
          const infoBanner = document.getElementById('popup-info');
          if (infoBanner) {
            infoBanner.classList.remove('hidden');
            const minutesAgo = Math.floor(age / 60000);
            infoBanner.innerHTML = `✓ Audit results from ${minutesAgo > 0 ? minutesAgo + ' min ago' : 'moments ago'}. Click "Run Audit" for fresh results.`;
          }
        } else {
          console.log('[Popup] Stored results too old, not restoring');
        }
      }
    });
  } catch (error) {
    console.error('[Popup] Restore error:', error);
  }
}

function clearAuditResults() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.remove(['lastAuditResults', 'lastAuditTimestamp']);
      console.log('[Popup] Audit results cleared');
    } catch (error) {
      console.error('[Popup] Clear error:', error);
    }
  }
  lastAuditResults = null;
}

console.log('[Popup] Popup script initialized');