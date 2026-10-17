import { defineConfig, devices } from "@playwright/test";

/**
 * The README's images and demo (slice 0016): `npm run screenshots`, run by a
 * person, never by `npm run test:e2e`.
 *
 * It starts no server. The images show the real agent, so it drives an app the
 * person has already started on the local model:
 *
 *   npm run app -- --examples --port 5035 --chats-dir <tmp>/chats --trials-dir <tmp>/trials --settings-dir <tmp>/settings
 *
 * The settings folder is empty on purpose (slice 0017): a person's own
 * `local/` may choose a hosted model, and a capture must neither spend on it
 * nor show its key. `CAPTURE_URL` points it elsewhere. The spec stops if the
 * page is in fake mode or on a hosted model. A parse on oMLX takes a minute or two and a reply several seconds,
 * hence the long timeouts. Everything but the images goes under `e2e/.out/`.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "capture.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 600_000,
  outputDir: "e2e/.out/capture/results",
  reporter: [["list"]],
  use: {
    baseURL: process.env.CAPTURE_URL ?? "http://127.0.0.1:5035",
  },
  projects: [
    {
      name: "chromium",
      // After the device preset, which would otherwise set 1280×720.
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        colorScheme: "light",
      },
    },
  ],
});
