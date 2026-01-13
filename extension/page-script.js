window.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "RUN_AXE") {
    if (!window.axe) {
      window.postMessage(
        {
          type: "AXE_RESULT",
          results: [{ error: "axe not loaded" }]
        },
        "*"
      );
      return;
    }

    const results = await window.axe.run(document);

    window.postMessage(
      {
        type: "AXE_RESULT",
        results: results.violations.map((v) => ({
          category: "Accessibility",
          issue: v.help,
          severity: v.impact
        }))
      },
      "*"
    );
  }
});
