import { test, expect, emailCode } from "./fixtures";

test.use({ serviceWorkers: "allow" });

test("offline creation and edits survive a PWA reload and upload once on reconnect", async ({ page, context, account }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create task", exact: true })).toBeEnabled();
  // Local development deliberately retires service workers. Explicitly
  // register the production artifact here to exercise an actual offline load.
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  });
  await context.setOffline(true);
  await expect(page.getByRole("status", { name: "Task sync status" })).toContainText("Offline");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("textbox", { name: "New task", exact: true }).fill("Offline task tomorrow 2pm");
  await page.getByRole("textbox", { name: "New task", exact: true }).press("Enter");
  const title = page.getByRole("textbox", { name: "Task title: Offline task", exact: true });
  await expect(title).toBeVisible();
  await page.getByRole("heading", { name: "Tasks", exact: true }).click();
  await title.fill("Offline renamed");
  await page.getByRole("heading", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Task title: Offline renamed", exact: true })).toBeVisible();
  await page.reload();
  const renamed = page.getByRole("textbox", { name: "Task title: Offline renamed", exact: true });
  await expect(renamed).toBeVisible();
  await page.getByRole("checkbox", { name: "Complete Offline renamed", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Complete Offline renamed", exact: true })).toBeChecked();
  await renamed.click();
  await page.getByRole("button", { name: "Delete Offline renamed", exact: true }).click();
  await expect(renamed).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(renamed).toBeVisible();
  await context.setOffline(false);
  await expect.poll(async () => (await account.list()).map(task => task.title), { timeout: 15000 }).toEqual(["Offline renamed"]);
  const [saved] = await account.list();
  expect(saved.completedAt).not.toBeNull(); expect(saved.dueKind).toBe("datetime");
  await page.reload();
  await expect(renamed).toBeVisible();
  expect((await account.list()).map(task => task.id)).toEqual([saved.id]);
});

test("two clients merge independent edits and a remote deletion wins over stale offline edits", async ({ page, context, browser, account }) => {
  const original = await account.create({ title: "Shared task" });
  const secondContext = await browser.newContext({ storageState: await context.storageState(), baseURL: "http://localhost:8790" });
  try {
    const other = await secondContext.newPage();
    await page.goto("/"); await other.goto("/");
    await expect(page.getByRole("textbox", { name: "Task title: Shared task", exact: true })).toBeVisible();
    await expect(other.getByRole("textbox", { name: "Task title: Shared task", exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("textbox", { name: "Task title: Shared task", exact: true }).fill("Offline title");
    await page.getByRole("heading", { name: "Tasks", exact: true }).click();
    await other.getByRole("checkbox", { name: "Complete Shared task", exact: true }).click();
    await expect.poll(async () => (await account.list())[0].completedAt).not.toBeNull();
    await context.setOffline(false);
    await expect.poll(async () => (await account.list())[0].title, { timeout: 15000 }).toBe("Offline title");
    await expect(page.getByRole("checkbox", { name: "Complete Offline title", exact: true })).toBeChecked();
    await context.setOffline(true);
    await page.getByRole("textbox", { name: "Task title: Offline title", exact: true }).fill("Stale edit");
    await page.getByRole("heading", { name: "Tasks", exact: true }).click();
    expect((await secondContext.request.delete(`/api/tasks/${original.id}`, { headers: { Origin: "http://localhost:8790" } })).status()).toBe(204);
    await context.setOffline(false);
    await expect(page.getByRole("textbox", { name: "Task title: Stale edit", exact: true })).toHaveCount(0, { timeout: 15000 });
    expect(await account.list()).toEqual([]);
  } finally { await secondContext.close(); }
});

test("switching accounts isolates local data and resumes pending writes only for their original account", async ({ page, context, account, email: originalEmail }) => {
  await account.create({ title: "Private original" });
  await page.goto("/");
  await page.route("**/api/sync/push", route => route.abort());
  await page.getByRole("textbox", { name: "Task title: Private original", exact: true }).fill("Private unsent edit");
  await page.getByRole("heading", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Task title: Private unsent edit", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const email = `switch-${crypto.randomUUID()}@example.test`;
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a code", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Email code", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Email code", exact: true }).fill(await emailCode(context, email));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("No tasks", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Task title: Private unsent edit", exact: true })).toHaveCount(0);
  expect(await account.list()).toEqual([]);
  expect((await context.request.get("/api/sync/pull", { headers: { "X-Dodo-Account": account.id } })).status()).toBe(403);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.unroute("**/api/sync/push");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(originalEmail);
  await page.getByRole("button", { name: "Email me a code", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Email code", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Email code", exact: true }).fill(await emailCode(context, originalEmail));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Task title: Private unsent edit", exact: true })).toBeVisible();
  await expect.poll(async () => (await account.list()).map(task => task.title), { timeout: 15000 }).toEqual(["Private unsent edit"]);
});

test("same-account tabs share local changes and sync continues after the leader tab closes", async ({ page, context, account }) => {
  await account.create({ title: "Shared tabs" });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Task title: Shared tabs", exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("textbox", { name: "Task title: Shared tabs", exact: true })).toBeVisible();
  await other.getByRole("textbox", { name: "Task title: Shared tabs", exact: true }).fill("From follower");
  await other.getByRole("heading", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Task title: From follower", exact: true })).toBeVisible();
  await expect.poll(async () => (await account.list())[0].title, { timeout: 15000 }).toBe("From follower");
  await page.close();
  await other.getByRole("textbox", { name: "Task title: From follower", exact: true }).fill("After leader closes");
  await other.getByRole("heading", { name: "Tasks", exact: true }).click();
  await expect.poll(async () => (await account.list())[0].title, { timeout: 15000 }).toBe("After leader closes");
});
