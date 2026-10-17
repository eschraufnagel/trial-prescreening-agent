import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { loadLabelSets } from "../evals/cases/load.js";
import { EVAL_RUN, REVIEW_DIR, type ReviewFile } from "../scripts/app/eval-run.js";
import { SCRIPTED_NOTE } from "../src/web/review.js";

/**
 * Case 1 (0010 spec §5.4, moved in 0014): what the app offers in fake mode,
 * which includes the examples. Screenings starts any labelled study; Reviews
 * opens any eval-run conversation.
 */
test("Screenings offers every labelled study, and Reviews every eval-run conversation", async ({
  page,
}) => {
  await page.goto("/#/screenings");

  const studies = loadLabelSets().map((l) => l.nctId);
  const cards = page.locator("li.study-card");
  for (const nctId of studies) {
    await expect(
      cards.filter({ hasText: nctId }).getByRole("button", { name: "Start" }),
    ).toBeVisible();
  }
  await expect(cards).toHaveCount(studies.length);
  await expect(page.getByText(SCRIPTED_NOTE)).toBeVisible();

  await page.getByRole("link", { name: "Reviews" }).click();
  const review = JSON.parse(readFileSync(join(REVIEW_DIR, EVAL_RUN), "utf8")) as ReviewFile;
  // Examples sit under their trials' headings (slice 0016): every row in the section.
  await expect(page.getByRole("heading", { name: "Examples (simulated patients)" })).toBeVisible();
  const evalList = page.locator("section[aria-labelledby=eval-h]");
  await expect(evalList.getByRole("listitem")).toHaveCount(review.conversations.length);
  await expect(evalList.getByRole("link", { name: "Open review" })).toHaveCount(
    review.conversations.length,
  );
  // The eval run's conversations are read-only: nothing to delete.
  await expect(evalList.getByRole("button", { name: "Delete…" })).toHaveCount(0);
});
