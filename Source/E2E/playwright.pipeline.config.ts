import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/cycle-run-1774590558624-dd1975d8",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "http://localhost:5102",
    headless: true,
  },
});
