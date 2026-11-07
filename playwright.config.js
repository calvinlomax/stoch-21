const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.js",
  timeout: 30000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:8765", channel: "chrome", headless: true },
  webServer: {
    command: "python3 -m http.server 8765 --bind 127.0.0.1",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: !process.env.CI,
  },
});
