export const TICKET_CATEGORIES = { question: "Question", problem: "Something isn’t working", billing: "Billing", account: "Account or sign in", feature: "Feature request" } as const;
export const TICKET_PRIORITIES = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent: my team can’t work" } as const;
export const TICKET_STATUS = { open: "Open", waiting_on_customer: "Waiting for you", resolved: "Resolved", closed: "Closed" } as const;
export const STATUS_TONE: Record<string, string> = { open: "bg-amber-50 text-warn", waiting_on_customer: "bg-blue-50 text-[#1E4E9C]", resolved: "bg-green-50 text-ok", closed: "bg-paper text-muted" };
