export const BRAND = {
  name: "5ime",
  altName: "fivetime",
  tagline: "Your schedule. Your approved workplace. On time.",
  supportEmail: "support@5ime.ng",
};

export const PLANS = {
  basic: {
    id: "basic",
    name: "Basic",
    pricePerSeat: 250,
    blurb: "For small teams with one office.",
    features: [
      "Company-email, Google & Microsoft sign-in",
      "1 office location + approved home locations",
      "GPS check-in / check-out (fixed 200m radius)",
      "One weekly office/home schedule for everyone",
      "Late arrival & early exit tracking",
      "Live “who’s in today” dashboard",
      "30 days of history, CSV export",
      "Email support",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    pricePerSeat: 500,
    blurb: "For growing companies with branches.",
    features: [
      "Everything in Basic",
      "Unlimited office locations / branches",
      "Custom check-in radius per location",
      "Per-person office/home schedules",
      "Manager role, departments & teams",
      "Device, IP & GPS-accuracy anomaly flags",
      "Unlimited history, attendance reporting & CSV export",
      "Priority WhatsApp & email support",
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
