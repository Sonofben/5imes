export const MIN_PASSWORD_LENGTH = 10;

/**
 * Return a list of human-friendly reasons the password is too weak.
 * Empty array means "fine". Keep the rules modest: length + one letter + one
 * digit. Fancier dictionaries belong behind the (future) sign-up server action,
 * not in the browser.
 */
export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) issues.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (!/[A-Za-z]/.test(password)) issues.push("Password must include at least one letter.");
  if (!/\d/.test(password)) issues.push("Password must include at least one number.");
  if (/^\s|\s$/.test(password)) issues.push("Password can’t start or end with a space.");
  return issues;
}
