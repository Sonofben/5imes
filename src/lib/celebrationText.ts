/**
 * The three celebration messages (birthday, work anniversary, both on the same day), used in the
 * app and in emails. Plain text, no dashes, filled with the person's first name, company and years.
 */
export type CelebrationKind = "birthday" | "anniversary" | "both";
export type CelebrationMessage = { kind: CelebrationKind; title: string; lines: string[]; emoji: string };

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const MILESTONES = new Set([1, 5, 10, 15, 20, 25, 30, 35, 40]);

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
function yearsWords(n: number) {
  return `${n <= 10 ? WORDS[n] : String(n)} year${n === 1 ? "" : "s"}`;
}

export function celebrationKind(p: { birthday: boolean; years?: number | null }): CelebrationKind | null {
  const anniversary = (p.years ?? 0) >= 1;
  if (p.birthday && anniversary) return "both";
  if (p.birthday) return "birthday";
  if (anniversary) return "anniversary";
  return null;
}

export function celebrationMessage(p: { firstName: string; company: string; birthday: boolean; years?: number | null }): CelebrationMessage | null {
  const kind = celebrationKind(p);
  const n = p.years ?? 0;
  const milestone = MILESTONES.has(n) ? ` ${n === 1 ? "Your first year is" : `${yearsWords(n)} is`} a milestone worth celebrating.` : "";
  if (kind === "birthday") return {
    kind, emoji: "🎉", title: `Happy Birthday, ${p.firstName}!`,
    lines: [
      `Today we celebrate you! Thank you for the smiles, energy and heart you bring to ${p.company} every day.`,
      "May this new year of your life overflow with good health, joy, peace and God's abundant blessings. May every dream you carry find its way to you.",
      "Have a wonderful day, you deserve it! 🎂",
    ],
  };
  if (kind === "anniversary") return {
    kind, emoji: "🏆", title: `Happy ${ordinal(n)} Work Anniversary, ${p.firstName}!`,
    lines: [
      `${yearsWords(n)} of commitment, growth and excellence at ${p.company}.${milestone}`,
      "Thank you for your dedication and the difference you make. The team is stronger because of you.",
      "Here's to new milestones, greater achievements and many more years of success together. Congratulations!",
    ],
  };
  if (kind === "both") return {
    kind, emoji: "🎉🏆", title: `A Double Celebration, ${p.firstName}!`,
    lines: [
      `Happy Birthday, and happy ${ordinal(n)} work anniversary at ${p.company}!${milestone}`,
      `Today we celebrate the wonderful person you are and the ${yearsWords(n).toLowerCase()} of great work you have given this team.`,
      "May this new year bring you good health, joy and God's abundant blessings, and may your career keep rising from strength to strength.",
      "Enjoy your special day. You have earned every bit of it!",
    ],
  };
  return null;
}

/** One line for colleagues: "Today is Amaka's birthday", "Tunde's 5th work anniversary", or both. */
export function celebrationHeadline(p: { name: string; birthday: boolean; years?: number | null }) {
  const kind = celebrationKind(p);
  const n = p.years ?? 0;
  if (kind === "both") return `${p.name}'s birthday and ${ordinal(n)} work anniversary`;
  if (kind === "birthday") return `${p.name}'s birthday`;
  return `${p.name}'s ${ordinal(n)} work anniversary`;
}
