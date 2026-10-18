export function Reason({ placeholder = "Reason (saved in the audit log)" }: { placeholder?: string }) {
  return <input name="reason" required minLength={5} placeholder={placeholder} className="input" aria-label="Reason" />;
}
