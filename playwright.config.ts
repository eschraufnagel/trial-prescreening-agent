import { defineConfig, devices } from "@playwright/test";

/**
 * The browser test (slice 0010): `npm run test:e2e`, never part of `npm test`.
 *
 * It builds the page and runs it with the scripted agent, so no model is ever
 * reached (`tests/boundary.test.ts` holds the command to `--fake`). Port 5015
 * keeps it clear of an `npm run app` on 5005, and it never reuses a server
 * already running. Conversations go to an emptied `e2e/.out/chats/`, never to
 * a person's `chats/`. Trials it adds go to an emptied `e2e/.out/trials/`,
 * never to `added-trials/` (slice 0013). Settings it saves go to an emptied
 * `e2e/.out/settings/`, never to `local/` (slice 0017). Everything it writes is under
 * `e2e/.out/`, gitignored.
 *
 * One worker and no retries: one server and one conversation directory are
 * shared, and a flaky browser test is a bug to fix, not to retry.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // Finishing a conversation is 23 replies.
  timeout: 60_000,
  outputDir: "e2e/.out/results",
  reporter: [["list"], ["html", { outputFolder: "e2e/.out/report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5015",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "rm -rf e2e/.out/chats e2e/.out/trials e2e/.out/settings && npm run app -- --fake --port 5015 --chats-dir e2e/.out/chats --trials-dir e2e/.out/trials --settings-dir e2e/.out/settings",
    url: "http://127.0.0.1:5015/api/info",
    reuseExistingServer: false,
    // Includes `vite build`.
    timeout: 60_000,
  },
});
