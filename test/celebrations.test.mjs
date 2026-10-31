// Celebration messages (src/lib/celebrationText.ts): right template, no dashes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { celebrationMessage, celebrationHeadline, ordinal } from "../src/lib/celebrationText.ts";

const all = (m) => [m.title, ...m.lines].join(" ");

test("three templates", () => {
  assert.equal(celebrationMessage({ firstName: "Amaka", company: "TROS", birthday: true, years: null }).kind, "birthday");
  assert.equal(celebrationMessage({ firstName: "Tunde", company: "TROS", birthday: false, years: 5 }).kind, "anniversary");
  assert.equal(celebrationMessage({ firstName: "Ada", company: "TROS", birthday: true, years: 3 }).kind, "both");
  assert.equal(celebrationMessage({ firstName: "X", company: "TROS", birthday: false, years: 0 }), null);
});

test("no dashes anywhere, names and years filled in", () => {
  for (const [b, y] of [[true, null], [false, 1], [false, 5], [true, 3], [true, 12]]) {
    const text = all(celebrationMessage({ firstName: "Ada", company: "TROS", birthday: b, years: y }));
    assert.ok(!/[—–]/.test(text), text);
    assert.ok(text.includes("Ada"));
    if (y) assert.ok(text.includes(ordinal(y)) || text.includes("year"), text);
  }
  assert.equal(celebrationMessage({ firstName: "Tunde", company: "TROS", birthday: false, years: 5 }).title, "Happy 5th Work Anniversary, Tunde!");
  assert.equal(celebrationHeadline({ name: "Ada", birthday: true, years: 3 }), "Ada's birthday and 3rd work anniversary");
  assert.equal(ordinal(11), "11th"); assert.equal(ordinal(22), "22nd"); assert.equal(ordinal(1), "1st");
});
