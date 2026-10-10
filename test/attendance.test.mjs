import test from "node:test";
import assert from "node:assert/strict";
import { afterShiftEndGrace, attendanceAlertWorkDate, isoWeekdayForDate, localClockMinutes } from "../src/lib/attendance.ts";

test("attendance alert time uses the organization time zone", () => {
  const now = new Date("2026-10-09T08:00:00.000Z");
  assert.equal(localClockMinutes(now, "Africa/Lagos"), 540);
  assert.equal(attendanceAlertWorkDate(now, "Africa/Lagos", "09:00", "17:00"), "2026-10-09");
});

test("absence alert starts after the configured end and grace period", () => {
  const before = new Date("2026-10-09T16:14:00.000Z"); // 17:14 in Lagos
  const due = new Date("2026-10-09T16:15:00.000Z"); // 17:15 in Lagos
  assert.equal(afterShiftEndGrace(before, "Africa/Lagos", "09:00", "17:00", 15, "2026-10-09"), false);
  assert.equal(afterShiftEndGrace(due, "Africa/Lagos", "09:00", "17:00", 15, "2026-10-09"), true);
});

test("overnight shifts stay associated with the prior work date before start time", () => {
  const earlyMorning = new Date("2026-10-09T01:30:00.000Z"); // 02:30 in Lagos
  assert.equal(attendanceAlertWorkDate(earlyMorning, "Africa/Lagos", "22:00", "06:00"), "2026-10-08");
  assert.equal(afterShiftEndGrace(earlyMorning, "Africa/Lagos", "22:00", "06:00", 15, "2026-10-08"), false);
  const afterGrace = new Date("2026-10-09T05:15:00.000Z"); // 06:15 in Lagos
  assert.equal(afterShiftEndGrace(afterGrace, "Africa/Lagos", "22:00", "06:00", 15, "2026-10-08"), true);
});

test("ISO weekdays map Sunday to seven", () => {
  assert.equal(isoWeekdayForDate("2026-10-05"), 1);
  assert.equal(isoWeekdayForDate("2026-10-11"), 7);
});
