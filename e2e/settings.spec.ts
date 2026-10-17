import { expect, type Response, test } from "@playwright/test";
import { SCRIPTED_SETTINGS } from "../src/web/logic.js";

/**
 * Case 11 (slice 0017): Settings in fake mode. A key is saved, shown only by
 * its last four characters, tested (scripted: no call), chosen, kept across a
 * reload and removed. Settings go to the emptied `e2e/.out/settings/`, and no
 * answer from the server ever carries the key.
 */
const KEY = "test-key-00000000";

test("case 11: a provider is chosen and its key saved, tested and removed, never sent back", async ({
  page,
}) => {
  const bodies: Promise<string>[] = [];
  page.on("response", (response: Response) => {
    if (response.url().includes("/api/")) {
      bodies.push(response.text().catch(() => ""));
    }
  });

  await page.goto("/#/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByText(SCRIPTED_SETTINGS)).toBeVisible();

  await page.getByRole("radio", { name: /Anthropic/ }).check();
  await expect(page.getByRole("combobox")).toHaveValue("claude-haiku-4-5");
  await page.getByRole("textbox", { name: "Key", exact: true }).fill(KEY);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Key saved (…0000).")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Key", exact: true })).toHaveValue("");

  await page.getByRole("button", { name: /^Test/ }).click();
  await expect(page.getByText(/^It works: scripted agent answered/)).toBeVisible();

  await page.getByRole("button", { name: "Use this model" }).click();
  await expect(page.getByRole("button", { name: "In use" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radio", { name: /Anthropic/ })).toBeChecked();
  await expect(page.getByText("Key saved (…0000).")).toBeVisible();

  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByText("No key saved.")).toBeVisible();

  const texts = await Promise.all(bodies);
  expect(texts.length).toBeGreaterThan(5);
  expect(texts.filter((t) => t.includes(KEY))).toEqual([]);
});
