import { z } from "zod";
import { logError } from "./log.ts";

/**
 * Shapes of data that crosses a trust boundary: form fields, request bodies, and database
 * functions that return jsonb (the database cannot describe those to TypeScript).
 * Parse with these instead of `as SomeType`, so a surprise shape fails safely instead of
 * flowing through the app.
 */

// ───────────────────────────── database jsonb results
export const Reservation = z.object({
  ok: z.boolean(),
  reason: z.string().nullish(),
  amount_kobo: z.coerce.number().int().nullish(),
  added_seats: z.coerce.number().int().nullish(),
}).passthrough();
export type Reservation = z.infer<typeof Reservation>;

export const PaymentResult = z.object({ ok: z.boolean(), reason: z.string().default("") }).passthrough();
export type PaymentResult = z.infer<typeof PaymentResult>;

/** Parse a jsonb result; on an unexpected shape, log it and return `fallback`. */
export function parseResult<T extends z.ZodTypeAny>(schema: T, data: unknown, where: string, fallback: z.infer<T>): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  logError(`${where}.shape`, new Error("Unexpected result shape"), { issues: parsed.error.issues.slice(0, 5) });
  return fallback;
}

// ───────────────────────────── form fields
const trimmed = (max: number) => z.string().trim().max(max);
export const email = z.string().trim().toLowerCase().max(254).email("Enter a valid email address.");
export const uuid = z.string().uuid("That link is not valid.");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-18.");
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:00.");
export const role = z.enum(["owner", "admin", "manager", "staff"]);
export const staffRole = z.enum(["admin", "manager", "staff"], { message: "Choose admin, manager or staff." });
export const shortText = trimmed(120);
export const note = trimmed(500);
export const reason = z.string().trim().min(5, "Give a short reason (at least 5 characters).").max(500);
export const seats = z.coerce.number().int("Seats must be a whole number.").min(1).max(10000, "No more than 10,000 seats.");
export const latitude = z.coerce.number().min(-90).max(90);
export const longitude = z.coerce.number().min(-180).max(180);
export const officeRadius = z.coerce.number().int("Radius must be a whole number of metres.").min(50, "Radius must be between 50 and 1000 metres.").max(1000, "Radius must be between 50 and 1000 metres.");

/** Read a FormData into an object and validate it. Returns the data, or the first problem as a sentence. */
export function parseForm<T extends z.ZodTypeAny>(schema: T, formData: FormData):
  { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") raw[k] = v;
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? "Some of the details aren’t valid." };
}

/** Look up a label or style by a key that came from the database as plain text, with a fallback. */
export function lookup<T>(map: Record<string, T>, key: string | null | undefined, fallback: T): T {
  return key != null && Object.hasOwn(map, key) ? map[key] : fallback;
}

/** A jsonb value as a plain object (empty when it is null, an array or a scalar). */
export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
