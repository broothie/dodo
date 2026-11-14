import { test, expect, emailCode } from "./fixtures";

test("email code form survives session revalidation after switching tabs", async ({ page, context, email }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a code", exact: true }).click();
  const code = page.getByRole("textbox", { name: "Email code", exact: true });
  await expect(code).toBeVisible();
  await code.fill("12");
  // Better Auth throttles focus refetches for five seconds.
  await page.clock.setFixedTime(new Date(Date.now() + 6000));
  const revalidated = page.waitForResponse(response => response.url().includes("/api/auth/get-session"));
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await page.bringToFront();
  // Headless tabs don't always change visibility. Deliver the event listened
  // to by Better Auth; its actual anonymous-session request must still run.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await revalidated;
  await expect(code).toHaveValue("12");
  await code.fill(await emailCode(context, email));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
});

test("appearance persists and sign-out returns to email-only login", async ({ page, account, email }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
});
