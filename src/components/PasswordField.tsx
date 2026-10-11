"use client";

import { useId, useState } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  label: string;
  hint?: string;
  autoComplete?: "current-password" | "new-password" | "one-time-code";
  minLength?: number;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  rightLink?: React.ReactNode;
};

/** Password input with a show/hide eye button and consistent hint styling. */
export function PasswordField({
  value, onChange, id,
  label, hint,
  autoComplete = "current-password",
  minLength, required = true, placeholder, disabled,
  rightLink,
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label" htmlFor={inputId}>{label}</label>
        {rightLink}
      </div>
      <div className="relative">
        <input
          id={inputId}
          type={show ? "text" : "password"}
          className="input pr-11"
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-muted hover:text-ink focus:text-ink focus:outline-none"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 7 9.5 7a16.4 16.4 0 0 1-3.3 3.9M6.3 7.5A16.5 16.5 0 0 0 2.5 12s3.5 7 9.5 7a10.8 10.8 0 0 0 4-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
