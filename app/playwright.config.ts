import { defineConfig } from "@playwright/test";
import path from "path";

const port = Number(process.env.PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const e2eDbPath =
  process.env.DOC_FORGE_DB_PATH ??
  path.join(process.cwd(), "data", "doc-forge.e2e.db");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: {
    timeout: process.env.LLM_PROVIDER === "mock" ? 15_000 : 45_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      LLM_PROVIDER: process.env.LLM_PROVIDER ?? "mock",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      DOC_FORGE_DB_PATH: e2eDbPath,
    },
  },
});
