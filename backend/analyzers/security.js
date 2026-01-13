const fetch = require("node-fetch");

module.exports = async function (url) {
  const issues = [];

  if (!url.startsWith("https")) {
    issues.push({
      category: "Security",
      issue: "Not using HTTPS",
      severity: "High",
    });
  }

  const res = await fetch(url);
  const headers = res.headers;
  if (!headers.get("content-security-policy")) {
    issues.push({
      category: "Security",
      issue: "Missing Content-Security-Policy",
      severity: "Medium",
    });
  }

  return issues;
};
