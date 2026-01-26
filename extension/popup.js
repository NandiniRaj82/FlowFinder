// Global variable to store fetched URLs
let availableUrls = [];
let pageSelectorExpanded = true;

// Initialize audit mode listeners
document.addEventListener('DOMContentLoaded', () => {
  const radioButtons = document.querySelectorAll('input[name="audit-mode"]');
  const modeContainers = document.querySelectorAll('[data-mode]');
  
  // Radio button change handler
  radioButtons.forEach(radio => {
    radio.addEventListener('change', handleModeChange);
  });

  // Click on container to select radio
  modeContainers.forEach(container => {
    container.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const radio = container.querySelector('input[type="radio"]');
        radio.checked = true;
        handleModeChange();
      }
    });
  });
});

// Handle audit mode change
function handleModeChange() {
  const selectedMode = document.querySelector('input[name="audit-mode"]:checked').value;
  const pageSelector = document.getElementById('page-selector');
  const pageList = document.getElementById('page-list');
  const searchInput = document.getElementById('page-search');
  
  if (selectedMode === 'select') {
    // Show page selector when "Select Pages" is chosen
    pageSelector.classList.remove('hidden');
    
    // Fetch sitemap if not already fetched
    if (availableUrls.length === 0) {
      fetchSitemapForSelection();
    }
  } else {
    // Hide page selector when other options are chosen
    pageSelector.classList.add('hidden');
    
    // Clear all checkboxes
    const checkboxes = pageList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    
    // Clear search input
    if (searchInput) {
      searchInput.value = '';
      // Trigger input event to reset filtering
      searchInput.dispatchEvent(new Event('input'));
    }
    
    // Reset selected count
    updateSelectedCount();
  }
}

// Fetch sitemap and populate page selector
async function fetchSitemapForSelection() {
  const pageSelector = document.getElementById('page-selector');
  const pageList = document.getElementById('page-list');
  
  pageList.innerHTML = '<div class="text-xs text-gray-400 text-center py-2">Loading pages...</div>';
  pageSelector.classList.remove('hidden');

  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    const url = tab.url;

    try {
      const sitemapRes = await fetch("http://localhost:3000/fetch-sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const sitemapData = await sitemapRes.json();
      availableUrls = sitemapData.urls || [url];

      if (availableUrls.length === 1) {
        pageList.innerHTML = '<div class="text-xs text-gray-400 text-center py-2">No sitemap found. Only current page available.</div>';
        return;
      }

      renderPageList(availableUrls);

    } catch (err) {
      console.error(err);
      pageList.innerHTML = '<div class="text-xs text-red-400 text-center py-2">Failed to load pages</div>';
    }
  });
}

// Render the page selection list
function renderPageList(urls) {
  const pageSelector = document.getElementById('page-selector');
  const pageList = document.getElementById('page-list');
  pageList.innerHTML = '';

  // Add toggle button at the top
  const toggleDiv = document.createElement('div');
  toggleDiv.className = 'flex items-center justify-between mb-2';
  toggleDiv.innerHTML = `
    <span class="text-xs text-gray-400">Pages to audit:</span>
    <button id="toggle-list" class="text-xs text-indigo-400 hover:text-indigo-300">
      ${pageSelectorExpanded ? '▲ Hide' : '▼ Show'}
    </button>
  `;
  pageSelector.insertBefore(toggleDiv, pageSelector.firstChild.nextSibling);

  // Toggle button handler
  document.getElementById('toggle-list').addEventListener('click', () => {
    pageSelectorExpanded = !pageSelectorExpanded;
    const listContainer = document.querySelector('.page-list-container');
    const toggleBtn = document.getElementById('toggle-list');
    
    if (pageSelectorExpanded) {
      listContainer.classList.remove('hidden');
      toggleBtn.innerHTML = '▲ Hide';
    } else {
      listContainer.classList.add('hidden');
      toggleBtn.innerHTML = '▼ Show';
    }
  });

  // Add "Select All" option
  const selectAllDiv = document.createElement('div');
  selectAllDiv.className = 'flex items-center gap-2 p-2 rounded bg-slate-800/50 cursor-pointer hover:bg-slate-700';
  selectAllDiv.setAttribute('data-page-item', 'true');
  selectAllDiv.innerHTML = `
    <input type="checkbox" id="select-all" class="cursor-pointer">
    <label for="select-all" class="text-xs cursor-pointer flex-1 font-semibold text-indigo-400">Select All (<span id="select-all-count">${urls.length}</span>)</label>
  `;
  pageList.appendChild(selectAllDiv);

  // Select all handler - only selects VISIBLE items
  selectAllDiv.querySelector('#select-all').addEventListener('change', (e) => {
    const visibleCheckboxes = Array.from(pageList.querySelectorAll('.page-checkbox'))
      .filter(cb => !cb.closest('[data-page-item]').classList.contains('hidden'));
    
    visibleCheckboxes.forEach(cb => cb.checked = e.target.checked);
    updateSelectedCount();
  });

  // Add individual pages
  urls.forEach((url, index) => {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'flex items-center gap-2 p-2 rounded bg-black/40 cursor-pointer hover:bg-slate-800';
    pageDiv.setAttribute('data-page-item', 'true');
    
    const urlObj = new URL(url);
    const displayPath = urlObj.pathname === '/' ? 'Home' : urlObj.pathname;
    
    pageDiv.innerHTML = `
      <input type="checkbox" id="page-${index}" value="${url}" class="page-checkbox cursor-pointer">
      <label for="page-${index}" class="text-xs cursor-pointer flex-1 truncate" title="${url}" data-search-text="${url.toLowerCase()}">${displayPath}</label>
    `;
    
    pageList.appendChild(pageDiv);

    // Checkbox change handler
    pageDiv.querySelector('.page-checkbox').addEventListener('change', () => {
      updateSelectedCount();
      updateSelectAllState();
    });
  });

  // Initialize search functionality
  initializeSearch();
  updateSelectedCount();
}

// Update selected page count
function updateSelectedCount() {
  const checkedBoxes = document.querySelectorAll('.page-checkbox:checked');
  document.getElementById('selected-count').textContent = checkedBoxes.length;
  updateSelectAllState();
}

// Update "Select All" checkbox state based on visible items
function updateSelectAllState() {
  const selectAllCheckbox = document.getElementById('select-all');
  const pageList = document.getElementById('page-list');
  
  if (!selectAllCheckbox) return;
  
  const visibleCheckboxes = Array.from(pageList.querySelectorAll('.page-checkbox'))
    .filter(cb => !cb.closest('[data-page-item]').classList.contains('hidden'));
  
  const visibleChecked = visibleCheckboxes.filter(cb => cb.checked);
  
  if (visibleCheckboxes.length === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (visibleChecked.length === visibleCheckboxes.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else if (visibleChecked.length > 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }
}

// Initialize search functionality
function initializeSearch() {
  const searchInput = document.getElementById('page-search');
  const pageList = document.getElementById('page-list');
  const filteredCountDiv = document.getElementById('filtered-count');
  const visibleCountSpan = document.getElementById('visible-count');
  const selectAllCountSpan = document.getElementById('select-all-count');
  
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    const pageItems = pageList.querySelectorAll('[data-page-item]');
    let visibleCount = 0;
    
    pageItems.forEach((item, index) => {
      // Skip the "Select All" row
      if (index === 0) return;
      
      const label = item.querySelector('label');
      const searchText = label.getAttribute('data-search-text');
      
      if (searchTerm === '' || searchText.includes(searchTerm)) {
        item.classList.remove('hidden');
        visibleCount++;
      } else {
        item.classList.add('hidden');
      }
    });
    
    // Update visible count display
    if (searchTerm !== '') {
      filteredCountDiv.classList.remove('hidden');
      visibleCountSpan.textContent = visibleCount;
      selectAllCountSpan.textContent = visibleCount;
    } else {
      filteredCountDiv.classList.add('hidden');
      selectAllCountSpan.textContent = availableUrls.length;
    }
    
    // Update "Select All" state after filtering
    updateSelectAllState();
    
    // Show message if no results
    if (visibleCount === 0 && searchTerm !== '') {
      let noResultsDiv = pageList.querySelector('#no-results');
      if (!noResultsDiv) {
        noResultsDiv = document.createElement('div');
        noResultsDiv.id = 'no-results';
        noResultsDiv.className = 'text-xs text-gray-500 text-center py-4';
        noResultsDiv.textContent = 'No pages found';
        pageList.appendChild(noResultsDiv);
      }
      noResultsDiv.classList.remove('hidden');
    } else {
      const noResultsDiv = pageList.querySelector('#no-results');
      if (noResultsDiv) {
        noResultsDiv.classList.add('hidden');
      }
    }
  });
  
  // Clear search when mode changes
  searchInput.value = '';
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

    } catch (err) {
      console.error(err);
      showError("Audit failed");
    }
  });
});

async function auditMultipleURLs(urls, tabId) {
  const results = [];
  let axeAvailable = false;

  // NEW: Check if Axe is available on first URL
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
    
    // Issue header with source badge
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex items-center justify-between mb-1';
    
    const sourceSpan = document.createElement('span');
    sourceSpan.className = `text-xs font-semibold ${issue.source === "axe" ? "text-violet-400" : "text-sky-400"}`;
    sourceSpan.textContent = issue.source.toUpperCase();
    if (issue.impact) {
      sourceSpan.textContent += ` (${issue.impact})`;
    }
    
    headerDiv.appendChild(sourceSpan);
    
    // Title
    const titleP = document.createElement('p');
    titleP.className = 'text-sm mt-1';
    titleP.textContent = issue.title;
    
    issueDiv.appendChild(headerDiv);
    issueDiv.appendChild(titleP);
    
    // NEW: Show pages affected if multiple pages
    if (issue.count > 1 && issue.pages && issue.pages.length > 0) {
      const pagesDiv = document.createElement('div');
      pagesDiv.className = 'mt-2 pt-2 border-t border-slate-700';
      
      const pagesHeader = document.createElement('div');
      pagesHeader.className = 'text-xs text-gray-400 mb-1';
      pagesHeader.textContent = `Found on ${issue.pages.length} page${issue.pages.length > 1 ? 's' : ''}:`;
      pagesDiv.appendChild(pagesHeader);
      
      const pagesList = document.createElement('div');
      pagesList.className = 'space-y-1';
      
      issue.pages.forEach(pageUrl => {
        const pageItem = document.createElement('div');
        pageItem.className = 'flex items-center gap-2';
        
        const urlObj = new URL(pageUrl);
        const displayPath = urlObj.pathname === '/' ? 'Home' : urlObj.pathname;
        
        const pathSpan = document.createElement('span');
        pathSpan.className = 'text-xs text-gray-300 flex-1 truncate';
        pathSpan.textContent = displayPath;
        pathSpan.title = pageUrl;
        
        if (issue.selector) {
          const viewBtn = document.createElement('button');
          viewBtn.className = 'text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700';
          viewBtn.innerHTML = '👁️ View';
          viewBtn.addEventListener('click', () => {
            highlightElementOnPage(issue.selector, pageUrl);
          });
          
          pageItem.appendChild(pathSpan);
          pageItem.appendChild(viewBtn);
        } else {
          pageItem.appendChild(pathSpan);
        }
        
        pagesList.appendChild(pageItem);
      });
      
      pagesDiv.appendChild(pagesList);
      issueDiv.appendChild(pagesDiv);
    } else if (issue.selector) {
      const viewBtn = document.createElement('button');
      viewBtn.className = 'mt-2 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1';
      viewBtn.innerHTML = '👁️ View on page';
      viewBtn.addEventListener('click', () => {
        highlightElementOnPage(issue.selector, issue.pages[0]);
      });
      issueDiv.appendChild(viewBtn);
    }
    
    issuesDiv.appendChild(issueDiv);
  });
}

function highlightElementOnPage(selector, targetUrl) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;

    if (targetUrl && tab.url !== targetUrl) {
      chrome.tabs.update(tab.id, { url: targetUrl }, () => {
        setTimeout(() => {
          sendHighlightMessage(tab.id, selector);
        }, 1500);
      });
    } else {
      sendHighlightMessage(tab.id, selector);
    }
  });
}

function sendHighlightMessage(tabId, selector) {
  chrome.tabs.sendMessage(tabId, { 
    action: "highlightElement", 
    selector: selector 
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Failed to highlight element:", chrome.runtime.lastError.message);
    }
  });
}