function parseMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) throw new Error("Expected a 24-hour time in HH:MM format.");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error("Expected a valid 24-hour time.");
  return hours * 60 + minutes;
}

export function localClockMinutes(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function localDate(at: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function addDateDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isoWeekdayForDate(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Work date whose shift is currently in progress (or most recently ended for an overnight shift). */
export function attendanceAlertWorkDate(at: Date, timezone: string, workStart: string, workEnd: string) {
  const start = parseMinutes(workStart);
  const end = parseMinutes(workEnd);
  const today = localDate(at, timezone);
  if (end <= start && localClockMinutes(at, timezone) < start) return addDateDays(today, -1);
  return today;
}

/** Whether the specified work date's scheduled end plus grace period has passed in its own time zone. */
export function afterShiftEndGrace(
  at: Date,
  timezone: string,
  workStart: string,
  workEnd: string,
  graceMinutes: number,
  workDate: string,
) {
  if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 180) {
    throw new Error("Grace period must be from 0 to 180 minutes.");
  }
  const start = parseMinutes(workStart);
  const end = parseMinutes(workEnd);
  const shiftEndOffset = end <= start ? 1 : 0;
  const deadlineMinutes = end + graceMinutes;
  const deadlineDate = addDateDays(workDate, shiftEndOffset + Math.floor(deadlineMinutes / 1440));
  const deadlineClock = deadlineMinutes % 1440;
  const nowDate = localDate(at, timezone);
  if (nowDate !== deadlineDate) return nowDate > deadlineDate;
  return localClockMinutes(at, timezone) >= deadlineClock;
}

export function timeLabel(value: string | null, timezone: string) {
  return value
    ? new Intl.DateTimeFormat("en-NG", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value))
    : "—";
}
