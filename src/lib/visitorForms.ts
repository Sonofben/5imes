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

