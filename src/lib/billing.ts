export const BILLING_CYCLES = {
  monthly: { months: 1, paystackInterval: "monthly", label: "Monthly" },
  quarterly: { months: 3, paystackInterval: "quarterly", label: "Every 3 months" },
  semiannual: { months: 6, paystackInterval: "biannually", label: "Every 6 months" },
  annual: { months: 12, paystackInterval: "annually", label: "Yearly" },
} as const;

export type BillingCycleId = keyof typeof BILLING_CYCLES;

export function billingAmountKobo(pricePerSeatNaira: number, seats: number, cycle: BillingCycleId) {
  if (!Number.isSafeInteger(pricePerSeatNaira) || pricePerSeatNaira < 0) throw new Error("Invalid seat price.");
  if (!Number.isSafeInteger(seats) || seats < 1) throw new Error("Choose at least one seat.");
  if (!Object.hasOwn(BILLING_CYCLES, cycle)) throw new Error("Invalid billing cycle.");
  const total = pricePerSeatNaira * seats * BILLING_CYCLES[cycle].months * 100;
  if (!Number.isSafeInteger(total)) throw new Error("The calculated total is too large.");
  return total;
}

export function proratedSeatAmountKobo(
  pricePerSeatNaira: number,
  addedSeats: number,
  cycle: BillingCycleId,
  periodStart: string | Date,
  periodEnd: string | Date,
  at: string | Date = new Date(),
) {
  const timestamp = (value: string | Date) => value instanceof Date ? value.getTime() : new Date(value).getTime();
  const start = timestamp(periodStart);
  const end = timestamp(periodEnd);
  const now = timestamp(at);
  if (![start, end, now].every(Number.isFinite) || end <= start || now < start || now >= end) {
    throw new Error("A valid active billing period is required.");
  }
  const fullTerm = billingAmountKobo(pricePerSeatNaira, addedSeats, cycle);
  const prorated = Math.round(fullTerm * (end - now) / (end - start));
  return Math.max(1, prorated);
}

export function addCalendarMonths(isoDate: string | Date, months: number) {
  if (!Number.isInteger(months) || months < 1 || months > 120) throw new Error("Invalid billing period.");
  const source = isoDate instanceof Date ? new Date(isoDate.getTime()) : new Date(isoDate);
  if (Number.isNaN(source.getTime())) throw new Error("Invalid billing date.");
  const originalDay = source.getUTCDate();
  const targetMonth = source.getUTCMonth() + months;
  const firstOfTarget = new Date(Date.UTC(source.getUTCFullYear(), targetMonth, 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(originalDay, lastDay));
  firstOfTarget.setUTCHours(source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds());
  return firstOfTarget.toISOString();
}
