import type { Page } from "@playwright/test";

/**
 * The review's rows, group by group, as the page lays them out: each group's
 * criterion ids in the order shown. Labelled ids are line numbers, so within
 * a group protocol order is ascending (0007's rule: rows keep protocol order).
 */
export async function rowsByGroup(page: Page): Promise<string[][]> {
  const groups: string[][] = [];
  for (const group of await page.locator("section.review-group").all()) {
    const ids: string[] = [];
    for (const row of await group.locator("li.review-row").all()) {
      ids.push((await row.getAttribute("id"))?.replace(/^row-/, "") ?? "");
    }
    groups.push(ids);
  }
  return groups;
}

/** Each group whose rows are out of protocol order, with the order it was shown in. */
export function outOfOrder(groups: readonly string[][]): string[][] {
  const line = (id: string) => Number(id.replace(/^\D+/, ""));
  return groups.filter((ids) => ids.some((id, i) => i > 0 && line(ids[i - 1] ?? "") > line(id)));
}

/**
 * Opens a review row and the group it sits in (slice 0014 folds both), the
 * way a coordinator would: a click on each summary that's still closed.
 * Locators only, since the Node tsconfig has no DOM types (0010's note).
 */
export async function openRow(page: Page, id: string): Promise<void> {
  const group = page.locator("section.review-group", { has: page.locator(`#row-${id}`) });
  if ((await group.locator(":scope > details").getAttribute("open")) === null) {
    await group.locator(":scope > details > summary").click();
  }
  const row = page.locator(`#row-${id} > details`);
  if ((await row.getAttribute("open")) === null) {
    await row.locator(":scope > summary").click();
  }
}
