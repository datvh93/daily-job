const { defineConfig } = require("@playwright/test");
const os = require("node:os");
const path = require("node:path");
module.exports = defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3199",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:3199/api/auth",
    reuseExistingServer: false,
    env: {
      PORT: "3199",
      DATA_DIR: path.join(os.tmpdir(), "daily-kho-browser-" + Date.now()),
    },
  },
});
