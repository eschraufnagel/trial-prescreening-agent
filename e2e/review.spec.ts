import { expect, type Page, test } from "@playwright/test";
import { exampleLabel, reviewHash } from "../src/web/logic.js";
import { EVAL_RUN_NOTE, findingWords, reasonWords } from "../src/web/review.js";
import { openRow, outOfOrder, rowsByGroup } from "./lib/rows.js";

/**
 * Cases 8–9 (0010 spec §5.4): a conversation of the committed eval run in the
 * coordinator review. NCT00077350-v2 from labels holds both of 0009's new
 * shapes: L18, clinical, reported as not applying, and L20, patient, closed
 * as not applying.
 */
const CONVERSATION = "eval NCT00077350-v2-labels";

async function openReview(page: Page): Promise<void> {
  await page.goto("/#/reviews");
  // Every trial has a "Simulated patient 2", so the row is found by its link (slice 0016).
  await page.locator(`a[href="${reviewHash(CONVERSATION)}"]`).click();
  await expect(
    page.locator(".review-head").getByText(exampleLabel(CONVERSATION), { exact: true }),
  ).toBeVisible();
}

test("case 8: an eval-run conversation opens in the review, rows in protocol order", async ({
  page,
}) => {
  await openReview(page);

  await expect(page.getByText(EVAL_RUN_NOTE)).toBeVisible();
  const groups = await rowsByGroup(page);
  expect(groups.flat().length).toBeGreaterThan(0);
  expect(outOfOrder(groups)).toEqual([]);
});

test("case 9: 0009's words for a criterion that doesn't apply, from the eval run", async ({
  page,
}) => {
  await openReview(page);

  await expect(page.locator("#row-L18").locator(".review-finding")).toHaveText(
    findingWords("exclusion", { status: "chart-review", reported: "does-not-apply" }),
  );
  await openRow(page, "L20");
  await expect(
    page.locator("#row-L20").getByText(`Why: ${reasonWords("does-not-apply")}`),
  ).toBeVisible();
});
