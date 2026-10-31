export const BRAND = {
  name: "5ime",
  altName: "fivetime",
  tagline: "Work from anywhere, 5 days, on time.",
  supportEmail: "support@5ime.ng",
};

export const PLANS = {
  basic: {
    id: "basic",
    name: "Basic",
    pricePerSeat: 300,
    maxSeats: 15,
    maxVisitorsMonth: 0,
    blurb: "For small teams with one office.",
    features: [
      "Up to 15 staff",
      "1 office + approved home locations",
      "GPS check-in and check-out (200 m area)",
      "One weekly office/home schedule for everyone",
      "Late arrival and early exit tracking",
      "Automatic check-out at closing time",
      "Nigerian public holidays built in",
      "Your logo in the app",
      "30 days of history, CSV export",
      "Email support",
      "Leave requests and approvals (standard leave types)",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    pricePerSeat: 600,
    maxSeats: null,
    maxVisitorsMonth: 100,
    blurb: "For growing companies with branches.",
    features: [
      "Everything in Basic, with unlimited staff",
      "Unlimited offices and branches, check-in area per office",
      "Schedules per person or team",
      "Managers and teams",
      "Automatic check-in on arrival, overtime and company holidays",
      "Your full brand: colours, sign-in page, app icon and emails",
      "Visitor management at one office (up to 100 visits a month)",
      "Weak-GPS flags, device and IP records",
      "Unlimited history and full reports",
      "WhatsApp and email support",
      "Full leave management: your own leave types, rules, bulk allowances, carry-over",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    pricePerSeat: 1000,
    maxSeats: null,
    maxVisitorsMonth: null,
    blurb: "For busy offices that welcome visitors.",
    features: [
      "Everything in Pro",
      "Unlimited visitors at every office",
      "Reception tablet with badge printing",
      "Fire-drill roll call: staff and visitors on site",
      "Visitor blocklist",
      "Visitor reports and full audit trail",
      "Priority support and set-up help",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;

export const TRIAL_DAYS = 14;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // ISO 1..7

export const FLAG_LABELS: Record<string, string> = {
  late: "Late",
  early_exit: "Left early",
  out_of_range: "Outside any approved location",
  wrong_location: "Wrong location for today",
  low_accuracy: "Weak GPS signal",
  off_day: "Non-working day",
  home_not_set: "Home location not approved",
  corrected: "Time corrected after manager approval",
  left_unapproved: "Moved without approval (session ended)",
  auto: "Automatic",
  holiday: "Holiday work",
  overtime: "Overtime",
  overtime_cap: "Stopped at the latest overtime time",
};

const PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "yandex.com", "zoho.com",
]);

export function isPublicEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  return !domain || PUBLIC_DOMAINS.has(domain);
}

export function naira(n: number) {
  return "₦" + n.toLocaleString("en-NG");
}
