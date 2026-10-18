import { test, expect, type Page } from "@playwright/test";

/** Collect Content-Security-Policy violations and script errors while a page is open. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/i.test(m.text())) problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(`script error: ${e.message}`));
  return problems;
}

for (const path of ["/", "/login", "/signup", "/privacy", "/terms", "/auth/forgot"]) {
  test(`${path} loads with no blocked scripts or errors`, async ({ page }) => {
    const problems = watch(page);
    const res = await page.goto(path, { waitUntil: "networkidle" });
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).toBeVisible();
    expect(problems).toEqual([]);
  });
}

test("the sign-in form is interactive (scripts ran under the CSP)", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByText("Use a one-time code instead").click();
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
});

test("security headers are sent, with a fresh CSP nonce on every request", async ({ request }) => {
  const a = await request.get("/login");
  const b = await request.get("/login");
  const h = a.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-powered-by"]).toBeUndefined();
  const nonce = (v: string) => v.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce(h["content-security-policy"])).not.toBe(nonce(b.headers()["content-security-policy"]));
});

test("a message typed into a link is not shown (only signed messages are)", async ({ page }) => {
  await page.goto("/login?error=Your+account+is+locked.+Call+0803+000+0000&msg=Pay+now");
  await expect(page.getByText("Your account is locked")).toHaveCount(0);
  await expect(page.getByText("Pay now")).toHaveCount(0);
});

test("protected pages send signed-out visitors to sign in", async ({ page }) => {
  for (const path of ["/admin", "/app", "/console", "/admin/staff"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("hidden and server files are never served", async ({ request }) => {
  for (const path of ["/.env", "/.git/config", "/docker-compose.yml", "/package.json", "/.next/BUILD_ID"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
  }
});

test("health endpoint reports the version and database state", async ({ request }) => {
  const res = await request.get("/api/health");
  expect([200, 503]).toContain(res.status());
  const body = await res.json();
  expect(body).toHaveProperty("version");
  expect(body).toHaveProperty("db");
});
