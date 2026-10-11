export const MIN_PASSWORD_LENGTH = 8;

/** Short hint shown under password fields. */
export const PASSWORD_HINT = "At least 8 characters, with a letter and a number. Mix in uppercase and symbols for a stronger password.";

/**
 * Return a list of human-friendly reasons the password is too weak.
 * Empty array means "fine". We keep the required bar modest (length + letter +
 * digit) so people don’t forget their password; the hint text nudges them
 * toward uppercase and symbols without blocking them.
 */
export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) issues.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (!/[A-Za-z]/.test(password)) issues.push("Password must include at least one letter.");
  if (!/\d/.test(password)) issues.push("Password must include at least one number.");
  if (/^\s|\s$/.test(password)) issues.push("Password can’t start or end with a space.");
  return issues;
}

/** Strength signal for the UI meter: 0 (too weak) → 4 (strong). */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
}
