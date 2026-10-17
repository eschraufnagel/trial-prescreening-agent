import { expect, type Locator, type Page, test } from "@playwright/test";
import { FAKE_ONLY, FAKE_STUDY } from "../scripts/app/fake-registry.js";
import {
  ADDED_MARK,
  CHECKLIST_NOTE,
  EXAMPLES_NOTE,
  FIRST_RUN_HEADING,
  PINNED_WORDS,
  STATE_WORDS,
} from "../src/web/logic.js";

/**
 * Case 10 (slices 0013 and 0014): Trials in fake mode. The server starts with
 * an emptied trials directory, so the first-run panel shows. Fake mode's one
 * invented study is added by its link, read, offered, opened as a checklist,
 * screened against and removed, and a person's screening of it is deleted.
 * The server reaches neither the registry nor a model.
 */

const PINNED = "NCT04316364";

function card(page: Page, nctId: string): Locator {
  return page.locator("article.trial-card").filter({ hasText: nctId });
}

async function add(page: Page, reference: string): Promise<void> {
  await page.getByRole("textbox", { name: "ClinicalTrials.gov link or NCT ID" }).fill(reference);
  await page.getByRole("button", { name: "Add trial" }).click();
}

test("case 10: a trial added by link is read, checked, screened against, removed and its screening deleted", async ({
  page,
}) => {
  // First run: nobody's trials yet, and the built-in examples below.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: FIRST_RUN_HEADING })).toBeVisible();
  await expect(page.getByText(EXAMPLES_NOTE)).toBeVisible();
  await expect(card(page, PINNED)).toContainText(PINNED_WORDS);
  await expect(card(page, PINNED).getByRole("button", { name: "Remove…" })).toHaveCount(0);

  // Added by its link: read, then ready, polled without a reload.
  await add(page, `https://clinicaltrials.gov/study/${FAKE_STUDY}`);
  await expect(card(page, FAKE_STUDY)).toContainText(STATE_WORDS.parsing);
  await expect(card(page, FAKE_STUDY)).toContainText("Ready · 5 criteria", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Your trials" })).toBeVisible();

  // Its checklist: what the AI read, before anyone screens against it.
  await card(page, FAKE_STUDY).getByRole("link", { name: "See the checklist" }).click();
  await expect(page.getByText(CHECKLIST_NOTE)).toBeVisible();
  const join = page.getByRole("region", { name: "Who can join" });
  await expect(join.getByText("Aged 18 or older")).toBeVisible();
  await expect(join.getByText("Person answers").first()).toBeVisible();

  // Screenings offers it, marked; a screening starts from its card on Trials.
  await page.getByRole("link", { name: "Screenings" }).click();
  await expect(page.locator("li.study-card").filter({ hasText: FAKE_STUDY })).toContainText(
    ADDED_MARK,
  );
  await page.getByRole("link", { name: "Trials" }).click();
  await card(page, FAKE_STUDY).getByRole("button", { name: "Start screening" }).click();
  await expect(page.getByText(/\(scripted\) Is this true for you: Aged 18 or older/)).toBeVisible();

  // Refused: a trial already listed, and one fake mode can't fetch.
  await page.getByRole("link", { name: "Trials" }).click();
  await add(page, PINNED);
  await expect(page.getByText(`${PINNED} is already listed.`)).toBeVisible();
  await add(page, "NCT99999999");
  await expect(card(page, "NCT99999999")).toContainText(STATE_WORDS.failed);
  await expect(card(page, "NCT99999999")).toContainText(FAKE_ONLY);

  // Removed, after a confirmation that can be cancelled.
  await card(page, "NCT99999999").getByRole("button", { name: "Remove…" }).click();
  await card(page, "NCT99999999").getByRole("button", { name: "Remove", exact: true }).click();
  await expect(card(page, "NCT99999999")).toHaveCount(0);
  await card(page, FAKE_STUDY).getByRole("button", { name: "Remove…" }).click();
  await card(page, FAKE_STUDY).getByRole("button", { name: "Cancel" }).click();
  await expect(card(page, FAKE_STUDY)).toBeVisible();
  await card(page, FAKE_STUDY).getByRole("button", { name: "Remove…" }).click();
  await card(page, FAKE_STUDY).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(card(page, FAKE_STUDY)).toHaveCount(0);

  // Gone from Screenings; its screening carries on, named by trial and time, and can be deleted.
  await page.getByRole("link", { name: "Screenings" }).click();
  await expect(page.locator("li.study-card").filter({ hasText: FAKE_STUDY })).toHaveCount(0);
  const mine = page
    .getByRole("heading", { name: "In progress" })
    .locator("xpath=following-sibling::ul[1]")
    .getByRole("listitem")
    .filter({ hasText: FAKE_STUDY });
  await expect(mine).toContainText("Invented study for the page's fake mode · today");
  await mine.getByRole("button", { name: "Delete…" }).click();
  await mine.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(mine).toHaveCount(0);
});
