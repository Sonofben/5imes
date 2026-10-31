export const STATUS_LABEL: Record<string, string> = { todo: "To do", in_progress: "In progress", in_review: "In review", done: "Done", cancelled: "Cancelled" };
export const PRIORITY: Record<string, { label: string; tone: string }> = {
  urgent: { label: "Urgent", tone: "bg-red-50 text-bad" }, high: { label: "High", tone: "bg-amber-50 text-warn" },
  normal: { label: "Normal", tone: "bg-paper text-muted" }, low: { label: "Low", tone: "bg-paper text-muted" },
};
export const RECURRENCE: Record<string, string> = { daily: "Every day", weekdays: "Every weekday", weekly: "Every week", monthly: "Every month" };
