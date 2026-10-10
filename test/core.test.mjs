import test from "node:test";
import assert from "node:assert/strict";
import { billingAmountKobo, proratedSeatAmountKobo, addCalendarMonths } from "../src/lib/billing.ts";
import { parseCsv, safeCsvField } from "../src/lib/csv.ts";

test("billing totals are seat price multiplied by seats and calendar months", () => {
  assert.equal(billingAmountKobo(250, 10, "monthly"), 250_000);
  assert.equal(billingAmountKobo(250, 10, "quarterly"), 750_000);
  assert.equal(billingAmountKobo(250, 10, "semiannual"), 1_500_000);
  assert.equal(billingAmountKobo(250, 10, "annual"), 3_000_000);
  assert.equal(billingAmountKobo(500, 10, "annual"), 6_000_000);
});

test("billing input validation rejects invalid seat counts and unsafe amounts", () => {
  assert.throws(() => billingAmountKobo(250, 0, "monthly"), /at least one seat/);
  assert.throws(() => billingAmountKobo(250, 10, "unknown"), /Invalid/);
});

test("calendar renewal clamps month-end dates and preserves UTC time", () => {
  assert.equal(addCalendarMonths("2026-01-31T09:30:00.000Z", 1), "2026-02-28T09:30:00.000Z");
  assert.equal(addCalendarMonths("2026-01-31T09:30:00.000Z", 3), "2026-04-30T09:30:00.000Z");
  assert.equal(addCalendarMonths("2026-08-31T09:30:00.000Z", 6), "2027-02-28T09:30:00.000Z");
});

test("seat additions are prorated only for the exact remaining part of the current term", () => {
  assert.equal(proratedSeatAmountKobo(250, 1, "quarterly", "2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z", "2026-03-02T00:00:00Z"), 25_000);
  assert.equal(proratedSeatAmountKobo(250, 2, "quarterly", "2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z", "2026-03-02T00:00:00Z"), 50_000);
  assert.throws(() => proratedSeatAmountKobo(250, 1, "monthly", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z", "2026-02-01T00:00:00Z"), /active billing period/);
});

test("CSV parser handles quoted commas, escaped quotes, CRLF and multiline names", () => {
  assert.deepEqual(parseCsv('email,name,team\r\na@x.test,"Benson, Joseph","Finance, West"\r\nb@x.test,"A ""quoted"" name","Ops\nEast"\r\n'), [
    ["email", "name", "team"],
    ["a@x.test", "Benson, Joseph", "Finance, West"],
    ["b@x.test", 'A "quoted" name', "Ops\nEast"],
  ]);
});

test("CSV parser rejects an unterminated quoted field", () => {
  assert.throws(() => parseCsv('a,"broken'), /unclosed quoted field/);
});

test("CSV export quotes fields and neutralizes formula-leading text after controls", () => {
  assert.equal(safeCsvField("name, team"), '"name, team"');
  const formula = safeCsvField('=HYPERLINK("x")');
  assert.equal(formula[0], '"');
  assert.equal(formula[1], "'");
  assert.ok(formula.includes('""x""'));
  assert.equal(safeCsvField("\t  @SUM(A1:A2)"), "'\t  @SUM(A1:A2)");
  assert.equal(safeCsvField(2500), "2500");
});
