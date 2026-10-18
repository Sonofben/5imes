import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";

/**
 * Signed-in smoke tests against staging. Needs (as CI secrets or local env):
 *   E2E_BASE_URL            e.g. https://staging.5imes.koraforge.com.ng
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_ADMIN_TOTP_SECRET   a company admin with two-factor
 *   E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD                            a staff member of the same company
 * Staging must use Cloudflare's Turnstile *test* keys (they always pass) if CAPTCHA is on.
 */
const env = process.env;
const ready = !!(env.E2E_BASE_URL && env.E2E_ADMIN_EMAIL && env.E2E_ADMIN_PASSWORD && env.E2E_ADMIN_TOTP_SECRET && env.E2E_STAFF_EMAIL && env.E2E_STAFF_PASSWORD);
test.skip(!ready, "E2E_BASE_URL and test accounts are not configured");

/** Current 6-digit code for a base32 authenticator secret (RFC 6238). */
function totp(secret: string, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("staff sign in, see the check-in screen, and cannot open admin pages", async ({ page }) => {
  await signIn(page, env.E2E_STAFF_EMAIL!, env.E2E_STAFF_PASSWORD!);
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole("button", { name: /check in|check out/i })).toBeVisible();
  await page.goto("/admin/staff");
  await expect(page).not.toHaveURL(/\/admin\/staff/);
});

test("a company admin signs in with two-factor and sees their own company only", async ({ page }) => {
  await signIn(page, env.E2E_ADMIN_EMAIL!, env.E2E_ADMIN_PASSWORD!);
  await page.waitForURL(/\/auth\/challenge|\/admin/);
  if (page.url().includes("/auth/challenge")) {
    await page.locator('input[autocomplete="one-time-code"]').first().fill(totp(env.E2E_ADMIN_TOTP_SECRET!));
    await page.getByRole("button", { name: /verify|continue/i }).click();
  }
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin/staff");
  await expect(page.getByText(env.E2E_STAFF_EMAIL!)).toBeVisible();
  const console = await page.goto("/console");
  expect(console?.status()).toBe(404);   // company admins are not Global Admin staff
});
