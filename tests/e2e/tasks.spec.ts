import { test, expect } from "./fixtures";

test("FAB creates a parsed task and Enter keeps the composer focused", async ({ page, account }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "New task", exact: true });
  await expect(composer).toHaveCount(0);
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await composer.fill("Call at 9am tomorrow 2pm");
  await composer.press("Enter");
  await expect(page.getByRole("textbox", { name: "Task title: Call at 9am", exact: true })).toBeVisible();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Tomorrow", exact: true })).toBeVisible();
  await expect.poll(async () => (await account.list()).length).toBe(1);
  const [saved] = await account.list();
  expect(saved.title).toBe("Call at 9am");
  expect(saved.dueKind).toBe("datetime");
  expect(saved.dueAt).toBeTruthy();
});

test("Enter saves an existing task and creates the next row with its deadline", async ({ page, account }) => {
  const parent = await account.create({ title: "Parent", dueKind: "datetime", dueAt: "2026-12-14T21:00:00.000Z", timeZone: "America/Los_Angeles" });
  await page.goto("/");
  const title = page.getByRole("textbox", { name: "Task title: Parent", exact: true });
  await title.fill("Renamed parent");
  await title.press("Enter");
  const composer = page.getByRole("textbox", { name: "New task", exact: true });
  await expect(composer).toBeFocused();
  await expect(page.getByRole("button", { name: "Set new task due date", exact: true })).toContainText("1pm");
  await composer.fill("Child");
  await composer.press("Enter");
  await expect(page.getByRole("textbox", { name: "Task title: Child", exact: true })).toBeVisible();
  await expect.poll(async () => (await account.list()).map(task => task.title).sort()).toEqual(["Child", "Renamed parent"]);
  const tasks = await account.list();
  expect(tasks.find(task => task.id === parent.id)?.title).toBe("Renamed parent");
  expect(tasks.find(task => task.title === "Child")).toMatchObject({ dueKind: parent.dueKind, dueAt: parent.dueAt, timeZone: parent.timeZone });
  const values = await page.getByRole("textbox").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  expect(values.indexOf("Child")).toBe(values.indexOf("Renamed parent") + 1);
});

test("outside clicks save edits; empty blur and Backspace delete with Undo", async ({ page, account }) => {
  const original = await account.create({ title: "Keep original" });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Task title: Keep original", exact: true }).fill("Saved outside");
  await page.getByRole("heading", { name: "Tasks", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Task title: Saved outside", exact: true });
  await expect(title).toBeVisible();
  await title.fill("");
  await page.getByRole("heading", { name: "Tasks", exact: true }).click();
  await expect(title).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(title).toHaveValue("Saved outside");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
  await title.fill("");
  await title.press("Backspace");
  await expect(title).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(title).toHaveValue("Saved outside");
  await expect.poll(async () => (await account.list()).map(task => task.title)).toEqual(["Saved outside"]);
  expect((await account.list())[0].id).toBe(original.id);
});

test("Delete needs no confirmation and Undo restores exact completed task metadata", async ({ page, account }) => {
  const original = await account.create({ title: "Restore me", dueKind: "datetime", dueAt: "2026-12-14T21:00:00.000Z", timeZone: "America/Los_Angeles" });
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Complete Restore me", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Complete Restore me", exact: true })).toBeChecked();
  await expect.poll(async () => (await account.list())[0].completedAt).not.toBeNull();
  const [completed] = await account.list();
  await page.getByRole("textbox", { name: "Task title: Restore me", exact: true }).click();
  await page.getByRole("button", { name: "Delete Restore me", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Task title: Restore me", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Complete Restore me", exact: true })).toBeChecked();
  await expect.poll(() => account.list()).toEqual([completed]);
  expect(completed.id).toBe(original.id);
});

test("date modal cancels on outside click and Clear removes the deadline", async ({ page, account }) => {
  const original = await account.create({ title: "Date modal", dueKind: "datetime", dueAt: "2026-12-14T21:00:00.000Z", timeZone: "America/Los_Angeles" });
  await page.goto("/");
  await page.getByRole("button", { name: "Set due date for Date modal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Remove time", exact: true }).click();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  expect(await account.list()).toEqual([original]);
  await page.getByRole("button", { name: "Set due date for Date modal", exact: true }).click();
  await dialog.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await account.list())[0]).toMatchObject({ dueKind: "none", dueAt: null, timeZone: null });
});

test("a server outage keeps the local edit durable and retries sync later", async ({ page, account }) => {
  await account.create({ title: "Retry edit" });
  await page.goto("/");
  await page.route("**/api/sync/push", route => route.fulfill({ status: 503, json: { error: "Temporary save failure" } }));
  const title = page.getByRole("textbox", { name: "Task title: Retry edit", exact: true });
  await title.fill("Retried successfully");
  await title.press("Enter");
  await expect(page.getByRole("textbox", { name: "Task title: Retried successfully", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "New task", exact: true })).toBeFocused();
  await expect(page.getByRole("status", { name: "Task sync status" })).toContainText("Sync paused");
  expect((await account.list())[0].title).toBe("Retry edit");
  await page.unroute("**/api/sync/push");
  await expect.poll(async () => (await account.list())[0].title, { timeout: 15000 }).toBe("Retried successfully");
});
