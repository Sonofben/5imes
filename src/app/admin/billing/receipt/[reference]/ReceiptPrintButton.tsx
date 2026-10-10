"use client";

export function ReceiptPrintButton() {
  return <button type="button" className="btn-primary btn-sm" onClick={() => window.print()}>Print / Save as PDF</button>;
}
