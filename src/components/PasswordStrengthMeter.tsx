"use client";

import { passwordStrength } from "@/lib/password";

const LABELS = ["", "Weak", "Fair", "Good", "Strong"] as const;
const COLORS = ["#e4e2db", "#ec8668", "#f0a73f", "#9ab6a6", "#2f6b4a"] as const;

/** Four-segment password strength bar; renders nothing until the user types. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordStrength(password);
  return (
    <div className="mt-1 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= score ? COLORS[score] : "#e4e2db" }} />
        ))}
      </div>
      <span className="w-10 text-right text-[11px] font-medium" style={{ color: COLORS[score] }}>{LABELS[score]}</span>
    </div>
  );
}
