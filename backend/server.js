const express = require("express");
const cors = require("cors");

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

app.listen(3000, () => {
  console.log("✅ Lighthouse server running on http://localhost:3000");
});
