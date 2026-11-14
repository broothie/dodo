import { test, expect } from "./fixtures";

test("sync activity stays in the header for a minimum duration without shifting tasks", async ({ page, account }) => {
  await account.create({ title: "Indicator check" });
  await page.goto("/");
  const title = page.getByRole("textbox", { name: "Task title: Indicator check", exact: true });
  const spinner = page.getByRole("progressbar", { name: "Syncing tasks", exact: true });
  await expect(title).toBeVisible();
  await expect(spinner).toHaveCount(0);
  const before = await title.boundingBox();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/sync/push", async route => { await held; await route.continue(); });
  // Observe actual mounted time rather than relying on test-runner timing.
  await page.evaluate(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const visible = !!document.querySelector('[aria-label="Syncing tasks"]');
      if (visible && !root.dataset.syncShownAt) root.dataset.syncShownAt = String(performance.now());
      if (!visible && root.dataset.syncShownAt) {
        root.dataset.syncVisibleMs = String(performance.now() - Number(root.dataset.syncShownAt));
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  try {
    await title.fill("Indicator saved");
    await title.press("Enter");
    await expect(spinner).toBeVisible();
    const saved = page.getByRole("textbox", { name: "Task title: Indicator saved", exact: true });
    expect((await saved.boundingBox())?.y).toBe(before?.y);
    await expect(page.getByText("Syncing…", { exact: true })).toHaveCount(0);
    release();
    await expect(spinner).toHaveCount(0);
    const duration = await page.evaluate(() => Number(document.documentElement.dataset.syncVisibleMs));
    expect(duration).toBeGreaterThanOrEqual(590);
    expect((await saved.boundingBox())?.y).toBe(before?.y);
  } finally { release(); }
});
