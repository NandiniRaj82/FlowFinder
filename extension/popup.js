document.getElementById("run").addEventListener("click", async () => {
  const output = document.getElementById("output");
  output.textContent = "Running Lighthouse...";

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const url = tabs[0].url;

    try {
      const res = await fetch("http://localhost:3000/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
      });

      const data = await res.json();
      output.textContent = JSON.stringify(data, null, 2);

    } catch (err) {
      output.textContent = "Backend not running";
    }
  });
});
