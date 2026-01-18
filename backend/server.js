const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { parseString } = require("xml2js");
const { JSDOM } = require("jsdom");

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

// NEW: Fetch and parse sitemap XML
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

// NEW: Parse XML sitemap
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
      }

      resolve({ isSitemapIndex: false, urls });
    });
  });
}

// NEW: Parse HTML sitemap
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

  return { isSitemapIndex: false, urls: [...new Set(urls)] };
}

// NEW: Recursively fetch all URLs from sitemap index
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
      .map(a => ({
        id: a.id,
        title: a.title,
        description: a.description
      }));

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

// NEW: Endpoint to fetch sitemap URLs
app.post("/fetch-sitemap", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  try {
    const result = await fetchSitemapURLs(url);

    if (!result) {
      return res.json({ 
        success: false, 
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
        urls: allUrls.length > 0 ? allUrls : [url],
        message: `Found ${allUrls.length} URLs from sitemap index`
      });
    }

    if (result.urls && result.urls.length > 0) {
      return res.json({ 
        success: true, 
        urls: result.urls,
        message: `Found ${result.urls.length} URLs from sitemap`
      });
    }

    return res.json({ 
      success: false, 
      message: "Sitemap found but no URLs extracted",
      urls: [url] 
    });

  } catch (err) {
    console.error("Sitemap fetch error:", err);
    res.json({ 
      success: false, 
      message: "Error fetching sitemap",
      urls: [url] 
    });
  }
});

app.listen(3000, () => {
  console.log("Lighthouse server running on http://localhost:3000");
});