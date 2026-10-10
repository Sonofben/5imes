"use client";

import type { FormEvent } from "react";

export function ConfirmAction({
  action,
  prompt,
  label,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  prompt: string;
  label: string;
  className: string;
}) {
  function confirmSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(prompt)) event.preventDefault();
  }

  return <form action={action} onSubmit={confirmSubmit}><button type="submit" className={className}>{label}</button></form>;
}
