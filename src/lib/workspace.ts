/**
 * Suggest a workspace name from a work email's domain, for the owner to confirm:
 *   joseph@trostechnologies.com → "Trostechnologies"
 *   ada@koraforge.com.ng        → "Koraforge"
 *   ops@mail.acme-foods.co.uk   → "Acme Foods"
 */
const SUFFIX_PARTS = new Set([
  "com", "net", "org", "edu", "gov", "mil", "int", "co", "ac", "or", "ne", "go", "sch", "info", "biz", "name", "pro",
  "ng", "uk", "us", "ca", "gh", "ke", "za", "io", "ai", "app", "dev", "tech", "online", "site", "africa", "global",
  "ltd", "plc", "inc", "llc",
]);
const HOST_PREFIXES = new Set(["www", "mail", "email", "webmail", "mx", "smtp", "imap", "pop", "office"]);

export function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

export function suggestWorkspaceName(emailOrDomain: string) {
  const domain = emailOrDomain.includes("@") ? emailDomain(emailOrDomain) : emailOrDomain.trim().toLowerCase();
  const labels = domain.split(".").filter(Boolean);
  while (labels.length > 1 && SUFFIX_PARTS.has(labels[labels.length - 1])) labels.pop();
  while (labels.length > 1 && HOST_PREFIXES.has(labels[0])) labels.shift();
  const core = labels[labels.length - 1] ?? "";
  return core
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
