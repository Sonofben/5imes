"use client";

import { cancelRenewal, resumeRenewal } from "./actions";

export function BillingSubscriptionActions({ cancelled }: { cancelled: boolean }) {
  const action = cancelled ? resumeRenewal : cancelRenewal;
  return <form action={action} onSubmit={(event) => {
    const message = cancelled
      ? "Resume automatic billing? Paystack will charge the saved payment authorization at the next renewal."
      : "Turn off automatic renewal? Your organization keeps access until the current paid period ends.";
    if (!window.confirm(message)) event.preventDefault();
  }}>
    <button className={cancelled ? "btn-primary" : "btn-ghost"}>{cancelled ? "Resume automatic renewal" : "Cancel automatic renewal"}</button>
  </form>;
}
