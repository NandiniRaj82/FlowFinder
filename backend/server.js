const express = require("express");
const lighthouse = require("lighthouse");
const chromeLauncher = require("chrome-launcher");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/audit", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const chrome = await chromeLauncher.launch({
      chromeFlags: ["--headless"]
    });

    const options = {
      logLevel: "info",
      output: "json",
      onlyCategories: ["performance", "seo", "best-practices", "accessibility"],
      port: chrome.port
    };

    const runnerResult = await lighthouse(url, options);

    await chrome.kill();

    const categories = runnerResult.lhr.categories;

    res.json({
      performance: categories.performance.score * 100,
      seo: categories.seo.score * 100,
      bestPractices: categories["best-practices"].score * 100,
      accessibility: categories.accessibility.score * 100
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lighthouse failed" });
  }
});

app.listen(3000, () => {
  console.log("Lighthouse server running on http://localhost:3000");
});
