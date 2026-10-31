import { expect, type Locator, type Page, test } from "@playwright/test";
import { MODEL_UNAVAILABLE } from "../src/server/conversations.js";
import { STATUS_WORDS } from "../src/web/logic.js";
import {
  findingWords,
  HEADER_NOTE,
  REQUEST_WORDS,
  reasonWords,
  SCRIPTED_NOTE,
} from "../src/web/review.js";
import { openRow, outOfOrder, rowsByGroup } from "./lib/rows.js";

/**
 * Cases 2–7 (0010 spec §5.4) and 12 (0021): a live conversation with the scripted agent.
 * NCT04316364 has the fewest raisable criteria, 23, asked in this order:
 * L1, L2, L3, L5, L6 (clinical), then L7 (patient), and so on.
 */
const STUDY = "NCT04316364";
const FINISHED = "This conversation is finished.";
const BUSY = "The agent is still working on your last message. Your draft is kept.";

/** The scripted agent's questions, one per criterion asked. */
function questions(page: Page): Locator {
  return page.getByText(/\(scripted\) Is this true for you:/);
}

/** A row of the tester panel, by its criterion id. */
function testerRow(page: Page, id: string): Locator {
  return page.locator("section.tester li.row").filter({ has: page.getByText(id, { exact: true }) });
}

/**
 * Starts a conversation from Screenings and waits for its first question,
 * then opens the tester panel, which starts folded (slice 0014).
 */
async function start(page: Page): Promise<void> {
  await page.goto("/#/screenings");
  await page
    .locator("li.study-card")
    .filter({ hasText: STUDY })
    .getByRole("button", { name: "Start" })
    .click();
  await expect(questions(page)).toHaveCount(1);
  await page.getByRole("button", { name: /^Show the \d+ rules$/ }).click();
}

/** Sends an answer and waits for the next question, or for the end. */
async function answer(page: Page, text: string): Promise<void> {
  const before = await questions(page).count();
  await page.getByRole("textbox").fill(text);
  await page.getByRole("textbox").press("Enter");
  await expect(async () => {
    const asked = await questions(page).count();
    const finished = await page.getByText(FINISHED).isVisible();
    expect(asked > before || finished).toBe(true);
  }).toPass({ timeout: 10_000 });
}

/** Answers `yes` until the conversation finishes. */
async function answerToTheEnd(page: Page): Promise<void> {
  for (let i = 0; i < 60 && !(await page.getByText(FINISHED).isVisible()); i++) {
    await answer(page, "yes");
  }
  await expect(page.getByText(FINISHED)).toBeVisible();
}

test("case 2: the tester panel follows the conversation", async ({ page }) => {
  await start(page);
  await expect(testerRow(page, "L1").getByText("asked, awaiting reply")).toBeVisible();

  await answer(page, "yes");

  const l1 = testerRow(page, "L1");
  await expect(l1.getByText(STATUS_WORDS["chart-review"], { exact: true })).toBeVisible();
  await expect(l1.getByText("person reported: holds")).toBeVisible();
  await expect(l1.getByText("asked, awaiting reply")).toHaveCount(0);
  await expect(testerRow(page, "L2").getByText("asked, awaiting reply")).toBeVisible();
});

test("case 3: a finished conversation opens in the coordinator review, rows in protocol order", async ({
  page,
}) => {
  await start(page);
  await answerToTheEnd(page);

  await page.getByRole("link", { name: "Open the coordinator review" }).click();

  await expect(page.getByText(HEADER_NOTE)).toBeVisible();
  await expect(page.getByText(SCRIPTED_NOTE, { exact: true })).toBeVisible();
  const groups = await rowsByGroup(page);
  expect(groups.flat().length).toBeGreaterThan(0);
  expect(outOfOrder(groups)).toEqual([]);
});

test("case 4: the model being down is said, and an edited resend carries on", async ({ page }) => {
  await start(page);

  await page.getByRole("textbox").fill("[down] yes");
  await page.getByRole("textbox").press("Enter");

  await expect(page.getByText(MODEL_UNAVAILABLE)).toBeVisible();
  await expect(page.getByText("not processed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send again" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveValue("[down] yes");

  await page.getByRole("textbox").fill("yes");
  await page.getByRole("button", { name: "Send again" }).click();

  await expect(questions(page)).toHaveCount(2);
  await expect(page.getByText(MODEL_UNAVAILABLE)).toHaveCount(0);
});

test("case 5: a second message is refused while the agent works, and drafts are kept", async ({
  page,
  context,
}) => {
  await start(page);
  // A second tab on the same conversation, loaded before the first sends, so
  // its view is behind when it sends.
  const behind = await context.newPage();
  await behind.goto(page.url());
  await expect(questions(behind)).toHaveCount(1);

  await page.getByRole("textbox").fill("[slow] yes");
  await page.getByRole("textbox").press("Enter");

  await expect(page.getByText(/^Thinking… \d+ s$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await page.getByRole("textbox").fill("typed while waiting");

  await behind.getByRole("textbox").fill("no");
  await behind.getByRole("button", { name: "Send" }).click();
  await expect(behind.getByText(BUSY)).toBeVisible();
  await expect(behind.getByRole("textbox")).toHaveValue("no");

  await expect(questions(page)).toHaveCount(2);
  await expect(page.getByRole("textbox")).toHaveValue("typed while waiting");
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
});

test("case 6: 0009's words for a criterion that doesn't apply, live", async ({ page }) => {
  await start(page);

  await answer(page, "n/a"); // L1, clinical, inclusion
  for (const id of ["L2", "L3", "L5", "L6"]) {
    await expect(testerRow(page, id).getByText("asked, awaiting reply")).toBeVisible();
    await answer(page, "yes");
  }
  await expect(testerRow(page, "L7").getByText("asked, awaiting reply")).toBeVisible();
  await answer(page, "n/a"); // L7, patient, inclusion

  await expect(testerRow(page, "L1").getByText("person reported: does-not-apply")).toBeVisible();
  await expect(testerRow(page, "L7").getByText("reason: does-not-apply")).toBeVisible();

  await answerToTheEnd(page);
  await page.getByRole("link", { name: "Open the coordinator review" }).click();

  await expect(page.locator("#row-L1").locator(".review-finding")).toHaveText(
    findingWords("inclusion", { status: "chart-review", reported: "does-not-apply" }),
  );
  await openRow(page, "L7");
  await expect(
    page.locator("#row-L7").getByText(`Why: ${reasonWords("does-not-apply")}`),
  ).toBeVisible();
});

test("case 7: a reload comes back where it was", async ({ page }) => {
  await start(page);
  await answer(page, "yes");
  await answer(page, "yes");
  const url = page.url();

  await page.reload();

  expect(page.url()).toBe(url);
  await expect(questions(page)).toHaveCount(3);
  // The tester panel was opened before the reload, and the page remembers it.
  await expect(page.getByRole("button", { name: "Hide the rules" })).toBeVisible();
  await expect(page.getByText("yes", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("textbox")).toHaveAttribute("placeholder", "Type your answer");
  for (const id of ["L1", "L2"]) {
    await expect(
      testerRow(page, id).getByText(STATUS_WORDS["chart-review"], { exact: true }),
    ).toBeVisible();
  }
  await expect(testerRow(page, "L3").getByText("asked, awaiting reply")).toBeVisible();
});

test("case 12: asked what a question means, the agent explains it and asks it again", async ({
  page,
}) => {
  await start(page);
  await expect(page.locator(".question-label")).toHaveText("Question 1");

  await page.getByRole("textbox").fill("[explain] what does that mean?");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByText(/\(scripted\) That question asks whether/)).toBeVisible();

  // The same question, explained: the number doesn't move and L1 is still awaiting its answer.
  await expect(page.locator(".question-label")).toHaveText("Question 1");
  await expect(testerRow(page, "L1").getByText("asked, awaiting reply")).toBeVisible();

  await answer(page, "yes");
  await expect(page.locator(".question-label")).toHaveText("Question 2");
  await answerToTheEnd(page);
  await page.getByRole("link", { name: "Open the coordinator review" }).click();

  await expect(
    page.locator(".review-transcript li").filter({ hasText: "what does that mean?" }),
  ).toContainText(REQUEST_WORDS.explain);
});
