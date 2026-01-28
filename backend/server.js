import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { parseString } from "xml2js";
import { JSDOM } from "jsdom";

const app = express();
app.use(cors());
app.use(express.json());

async function runAudit(url) {
  const lighthouse = (await import("lighthouse")).default;
  const { launch } = await import("chrome-launcher");

  const chrome = await launch({
    chromeFlags: ["--headless", "--no-sandbox"]
  });

  const options = {
    logLevel: "info",
    output: "json",
    onlyCategories: ["performance", "seo", "best-practices", "accessibility"],
    port: chrome.port
  };

  const result = await lighthouse(url, options);
  await chrome.kill();

  return result.lhr;
}

// Crawl website to discover URLs
async function crawlWebsite(baseUrl, maxPages = 50) {
  const urlObj = new URL(baseUrl);
  const domain = `${urlObj.protocol}//${urlObj.host}`;
  
  const discovered = new Set([baseUrl]);
  const visited = new Set();
  const toVisit = [baseUrl];
  
  console.log(`Starting crawl from ${baseUrl} (max ${maxPages} pages)`);
  
  while (toVisit.length > 0 && visited.size < maxPages) {
    const currentUrl = toVisit.shift();
    
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);
    
    try {
      console.log(`Crawling: ${currentUrl} (${visited.size}/${maxPages})`);
      
      const response = await fetch(currentUrl, { 
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FlowFinder/1.0)'
        }
      });
      
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
        continue;
      }
      
      const html = await response.text();
      const dom = new JSDOM(html);
      const links = dom.window.document.querySelectorAll('a[href]');
      
      links.forEach(link => {
        try {
          let href = link.href;
          
          // Convert relative URLs to absolute
          if (href.startsWith('/')) {
            href = `${domain}${href}`;
          } else if (!href.startsWith('http')) {
            return; // Skip invalid URLs
          }
          
          const linkUrl = new URL(href);
          
          // Only crawl same domain
          if (linkUrl.host !== urlObj.host) return;
          
          // UPDATED: Skip common file types, anchors, and non-HTML resources
          const path = linkUrl.pathname.toLowerCase();
          if (path.match(/\.(jpg|jpeg|png|gif|pdf|zip|mp4|css|js|svg|webp|ico|woff|woff2|ttf|eot|doc|docx|xls|xlsx|ppt|pptx)$/)) return;
          
          // Remove hash/fragment
          linkUrl.hash = '';
          const cleanUrl = linkUrl.toString();
          
          if (!discovered.has(cleanUrl)) {
            discovered.add(cleanUrl);
            if (visited.size + toVisit.length < maxPages) {
              toVisit.push(cleanUrl);
            }
          }
        } catch (e) {
          // Invalid URL, skip
        }
      });
      
    } catch (err) {
      console.error(`Failed to crawl ${currentUrl}:`, err.message);
    }
  }
  
  console.log(`Crawl complete: found ${discovered.size} URLs`);
  return Array.from(discovered);
}

// Fetch and parse sitemap XML
async function fetchSitemapURLs(baseUrl) {
  const urlObj = new URL(baseUrl);
  const domain = `${urlObj.protocol}//${urlObj.host}`;
  
  const sitemapUrls = [
    `${domain}/sitemap.xml`,
    `${domain}/sitemap_index.xml`,
    `${domain}/page-sitemap.xml`,
    `${domain}/post-sitemap.xml`
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const response = await fetch(sitemapUrl, { timeout: 5000 });
      if (response.ok) {
        const text = await response.text();
        
        // Check if it's XML sitemap
        if (text.includes('<urlset') || text.includes('<sitemapindex')) {
          return await parseXMLSitemap(text, domain);
        }
      }
    } catch (err) {
      // Continue to next sitemap URL
    }
  }

  // Try HTML sitemap
  const htmlSitemapUrls = [
    `${domain}/sitemap`,
    `${domain}/sitemap.html`,
    `${domain}/page-sitemap.html`
  ];

  for (const htmlUrl of htmlSitemapUrls) {
    try {
      const response = await fetch(htmlUrl, { timeout: 5000 });
      if (response.ok) {
        const html = await response.text();
        return parseHTMLSitemap(html, domain);
      }
    } catch (err) {
      // Continue
    }
  }

  return null;
}

// UPDATED: Filter out non-HTML URLs
function filterHTMLUrls(urls) {
  return urls.filter(url => {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();
      
      // Exclude common file extensions and resources
      if (path.match(/\.(jpg|jpeg|png|gif|pdf|zip|mp4|css|js|svg|webp|ico|woff|woff2|ttf|eot|doc|docx|xls|xlsx|ppt|pptx|xml|json|txt)$/)) {
        return false;
      }
      
      // Exclude common non-page paths
      if (path.includes('/wp-content/') || path.includes('/wp-includes/') || path.includes('/assets/')) {
        return false;
      }
      
      return true;
    } catch (e) {
      return false;
    }
  });
}

// Parse XML sitemap
async function parseXMLSitemap(xmlContent, domain) {
  return new Promise((resolve, reject) => {
    parseString(xmlContent, (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      let urls = [];

      // Check if it's a sitemap index
      if (result.sitemapindex && result.sitemapindex.sitemap) {
        const sitemapLocs = result.sitemapindex.sitemap.map(s => s.loc[0]);
        resolve({ isSitemapIndex: true, sitemaps: sitemapLocs });
        return;
      }

      // Regular sitemap
      if (result.urlset && result.urlset.url) {
        urls = result.urlset.url.map(u => u.loc[0]);
        // UPDATED: Filter HTML URLs only
        urls = filterHTMLUrls(urls);
      }

      resolve({ isSitemapIndex: false, urls });
    });
  });
}

// Parse HTML sitemap
function parseHTMLSitemap(html, domain) {
  const dom = new JSDOM(html);
  const links = dom.window.document.querySelectorAll('a[href]');
  
  const urls = Array.from(links)
    .map(a => {
      const href = a.href;
      if (href.startsWith('http')) return href;
      if (href.startsWith('/')) return `${domain}${href}`;
      return null;
    })
    .filter(url => url && url.startsWith(domain));

  // UPDATED: Filter HTML URLs only
  const filteredUrls = filterHTMLUrls([...new Set(urls)]);
  
  return { isSitemapIndex: false, urls: filteredUrls };
}

// Recursively fetch all URLs from sitemap index
async function getAllUrlsFromSitemaps(sitemaps, domain) {
  let allUrls = [];

  for (const sitemapUrl of sitemaps) {
    try {
      const response = await fetch(sitemapUrl, { timeout: 5000 });
      if (response.ok) {
        const text = await response.text();
        const parsed = await parseXMLSitemap(text, domain);
        
        if (parsed.urls) {
          allUrls = allUrls.concat(parsed.urls);
        }
      }
    } catch (err) {
      console.error(`Failed to fetch sitemap: ${sitemapUrl}`);
    }
  }

  return [...new Set(allUrls)];
}

app.post("/audit", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  try {
    const lhr = await runAudit(url);

    const accessibilityIssues = Object.values(lhr.audits)
      .filter(a => a.score === 0 && a.details?.type === "table")
      .map(a => {
        // Extract selector from various possible locations in Lighthouse data
        let selector = null;
        if (a.details?.items && a.details.items.length > 0) {
          const firstItem = a.details.items[0];
          selector = firstItem.selector || firstItem.node?.selector || null;
        }
        
        return {
          id: a.id,
          title: a.title,
          description: a.description,
          selector: selector
        };
      });

    res.json({
      scores: {
        performance: Math.round(lhr.categories.performance.score * 100),
        seo: Math.round(lhr.categories.seo.score * 100),
        bestPractices: Math.round(lhr.categories["best-practices"].score * 100),
        accessibility: Math.round(lhr.categories.accessibility.score * 100)
      },
      lighthouseAccessibilityIssues: accessibilityIssues
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lighthouse audit failed" });
  }
});

// Enhanced endpoint with crawling fallback
app.post("/fetch-sitemap", async (req, res) => {
  const { url, crawlIfNoSitemap = true, maxCrawlPages = 50 } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  try {
    // First, try to find sitemap
    const result = await fetchSitemapURLs(url);

    if (!result) {
      // No sitemap found - crawl if enabled
      if (crawlIfNoSitemap) {
        console.log("No sitemap found, starting web crawl...");
        const crawledUrls = await crawlWebsite(url, maxCrawlPages);
        
        return res.json({ 
          success: true,
          method: 'crawl',
          urls: crawledUrls,
          message: `No sitemap found. Crawled ${crawledUrls.length} pages`
        });
      }
      
      return res.json({ 
        success: false, 
        method: 'none',
        message: "No sitemap found",
        urls: [url] 
      });
    }

    if (result.isSitemapIndex) {
      const urlObj = new URL(url);
      const domain = `${urlObj.protocol}//${urlObj.host}`;
      const allUrls = await getAllUrlsFromSitemaps(result.sitemaps, domain);
      
      return res.json({ 
        success: true,
        method: 'sitemap',
        urls: allUrls.length > 0 ? allUrls : [url],
        message: `Found ${allUrls.length} URLs from sitemap index`
      });
    }

    if (result.urls && result.urls.length > 0) {
      return res.json({ 
        success: true,
        method: 'sitemap',
        urls: result.urls,
        message: `Found ${result.urls.length} URLs from sitemap`
      });
    }

    // Sitemap found but empty - try crawling
    if (crawlIfNoSitemap) {
      console.log("Sitemap empty, starting web crawl...");
      const crawledUrls = await crawlWebsite(url, maxCrawlPages);
      
      return res.json({ 
        success: true,
        method: 'crawl',
        urls: crawledUrls,
        message: `Sitemap empty. Crawled ${crawledUrls.length} pages`
      });
    }

    return res.json({ 
      success: false,
      method: 'none',
      message: "Sitemap found but no URLs extracted",
      urls: [url] 
    });

  } catch (err) {
    console.error("Sitemap fetch error:", err);
    
    // If crawling is enabled, try that as fallback
    if (crawlIfNoSitemap) {
      try {
        console.log("Error fetching sitemap, trying web crawl...");
        const crawledUrls = await crawlWebsite(url, maxCrawlPages);
        
        return res.json({ 
          success: true,
          method: 'crawl',
          urls: crawledUrls,
          message: `Crawled ${crawledUrls.length} pages (sitemap failed)`
        });
      } catch (crawlErr) {
        console.error("Crawl also failed:", crawlErr);
      }
    }
    
    res.json({ 
      success: false,
      method: 'none',
      message: "Error fetching sitemap",
      urls: [url] 
    });
  }
});

app.listen(3000, () => {
  console.log("Lighthouse server running on http://localhost:3000");
});