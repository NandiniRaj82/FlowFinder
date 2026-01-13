const lighthouse = require("lighthouse");
const chromeLauncher = require("chrome-launcher");

module.exports = async function (url) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless"],
  });

  const result = await lighthouse(url, { port: chrome.port, onlyCategories: ["performance", "seo"] });
  await chrome.kill();

  const {categories} = result.lhr;

  return [
    {
      category: "Performance",
      score: categories.performance.score * 100,
    },
    {
      category: "SEO",
      score: categories.seo.score * 100,
    },
  ];
};
