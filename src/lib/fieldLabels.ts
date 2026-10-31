export const OUTCOMES: Record<string, string> = {
  completed: "Done as planned", order_taken: "Order taken", follow_up: "Needs a follow-up visit",
  no_one_available: "No one available", issue_reported: "Problem found", other: "Other",
};
export const VISIT_FLAGS: Record<string, string> = {
  very_short: "Very short visit", ended_away: "Checked out away from the site", no_location_at_end: "No location at check-out",
  not_checked_out: "Forgot to check out (closed after 12 h)",
};
export function minutes(n: number) {
  const h = Math.floor(n / 60), m = Math.round(n % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
