import { z } from "zod";

/** The visitor invitation form, shared by the admin and staff screens. */
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
export const InviteForm = z.object({
  location: z.string().uuid("Choose an office."),
  name: z.string().trim().min(2, "Enter the visitor’s name.").max(120),
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address, or leave it empty.").optional().or(z.literal("")).transform((v) => v || null),
  phone: opt(30),
  company: opt(120),
  purpose: opt(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the visit date."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose the visit time."),
  host: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
});


const optEmail = z.string().trim().toLowerCase().max(254).email("Enter a valid email address, or leave it empty.").optional().or(z.literal("")).transform((v) => v || null);
const accepted = z.literal(true, { message: "Please accept the visitor rules and privacy notice." });

/** A walk-in visitor's form, sent from their own phone after scanning the reception poster. */
export const WalkinForm = z.object({
  link: z.string().regex(/^[A-Za-z2-9]{10}$/, "This visitor link is not valid."),
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  phone: z.string().trim().min(7, "Enter your phone number.").max(30),
  email: optEmail,
  company: opt(120),
  reason: z.enum(["meeting", "delivery", "interview", "contractor", "other"], { message: "Choose the reason for your visit." }),
  purpose: opt(200),
  host: opt(120),
  rules: accepted,
});

/** An invited visitor checking in from the link in their invitation email. */
export const CheckinForm = z.object({
  token: z.string().regex(/^[A-Z2-9]{32}$/, "This visitor pass is not valid."),
  code: z.string().trim().min(8, "Enter the 8-character code from your invitation.").max(12),
  phone: opt(30),
  company: opt(120),
  rules: accepted,
});

/** Visitor settings (admins). */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const VisitorSettingsForm = z.object({
  rules: z.string().trim().min(1, "Write the visitor rules (a sentence is enough).").max(2000),
  notice: z.string().trim().min(1, "Write the privacy notice visitors see.").max(3000),
  retention: z.coerce.number().int().min(7, "Keep visitor details for at least 7 days.").max(365, "Keep visitor details for at most 365 days."),
  photoRetention: z.coerce.number().int().min(1, "Keep photos for at least 1 day.").max(365),
  photo: checkbox, notify: checkbox, admit: checkbox, autoInvited: checkbox, hours: checkbox,
});
