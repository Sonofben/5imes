"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { celebrationHeadline, celebrationMessage } from "@/lib/celebrationText";
import type { Celebrant } from "@/lib/jsonShapes";
import { sendWish } from "./profile/actions";

const COLOURS = ["#e65b35", "#f2b134", "#1e4e9c", "#2f9e6e", "#c7362f", "#7b5cd6"];

/**
 * Celebrations in the app. The person celebrating sees a full celebration screen with their
 * message and colleagues' wishes; everyone else sees a pop-up and can send wishes. Each shows once
 * a day on this device, and the card on the home screen opens it again.
 */
export function CelebrationPopup({ people, meId, company, today, wishes, accent }: {
  people: Celebrant[]; meId: string; company: string; today: string; wishes: { from: string; message: string }[]; accent: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const mine = people.find((p) => p.member_id === meId);
  const others = people.filter((p) => p.member_id !== meId);
  const key = `5ime-celebrate-${today}`;

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(key) === "1"; } catch { /* private mode: show it */ }
    if (!seen && people.length) ref.current?.showModal();
  }, [key, people.length]);

  function close() {
    try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
    ref.current?.close();
  }

  if (!people.length) return null;
  const myMessage = mine ? celebrationMessage({ firstName: mine.first_name, company, birthday: mine.birthday, years: mine.years }) : null;

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="card mb-4 flex w-full items-center gap-3 text-left">
        <div className="flex -space-x-3">{people.slice(0, 3).map((p) => <Avatar key={p.member_id} name={p.name} url={p.avatar_url} size={40} />)}</div>
        <span className="min-w-0 flex-1"><b className="block">🎂 Celebrating today</b>
          <span className="block truncate text-sm text-muted">{people.map((p) => celebrationHeadline({ name: p.first_name, birthday: p.birthday, years: p.years })).join(", ")}</span></span>
        <span className="text-sm font-semibold underline">Open</span>
      </button>

      <dialog ref={ref} aria-labelledby="celebrate-title" onClose={close} className="w-[min(94vw,480px)] overflow-hidden rounded-3xl p-0 backdrop:bg-ink/60">
        <style>{`@keyframes fall{0%{transform:translateY(-20px) rotate(0)}100%{transform:translateY(560px) rotate(540deg)}}@media (prefers-reduced-motion: reduce){.confetti{display:none}}`}</style>
        <div className="relative">
          <div aria-hidden="true" className="confetti pointer-events-none absolute inset-0 overflow-hidden">
            {Array.from({ length: 36 }, (_, i) => (
              <span key={i} className="absolute top-0 block h-2.5 w-1.5 rounded-sm"
                style={{ left: `${(i * 137) % 100}%`, background: COLOURS[i % COLOURS.length], animation: `fall ${2.6 + (i % 5) * 0.5}s linear ${(i % 7) * 0.35}s infinite` }} />
            ))}
          </div>

          {mine && myMessage ? (
            <div className="relative space-y-4 px-6 pb-6 pt-8 text-center" style={{ background: `linear-gradient(180deg, ${accent}22, #ffffff 45%)` }}>
              <div className="flex justify-center"><Avatar name={mine.name} url={mine.avatar_url} size={104} ring={accent} /></div>
              <p className="text-3xl">{myMessage.emoji}</p>
              <h2 id="celebrate-title" className="text-2xl font-extrabold">{myMessage.title}</h2>
              <div className="space-y-2 text-[15px] leading-6 text-ink/85">{myMessage.lines.map((l) => <p key={l}>{l}</p>)}</div>
              {wishes.length > 0 && <div className="space-y-2 rounded-2xl bg-paper p-3 text-left">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Wishes from your colleagues</p>
                <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">{wishes.map((w, i) => <li key={i}><b>{w.from}:</b> {w.message}</li>)}</ul>
              </div>}
              {others.length > 0 && <p className="text-sm text-muted">Also celebrating today: {others.map((p) => p.first_name).join(", ")}</p>}
              <button type="button" onClick={close} className="btn-primary w-full">Thank you!</button>
            </div>
          ) : (
            <div className="relative space-y-4 px-6 pb-6 pt-7">
              <h2 id="celebrate-title" className="text-center text-xl font-extrabold">🎉 Celebrating today at {company}</h2>
              <ul className="space-y-4">{others.map((p) => {
                const m = celebrationMessage({ firstName: p.first_name, company, birthday: p.birthday, years: p.years });
                return <li key={p.member_id} className="rounded-2xl border border-line bg-white p-4">
                  <div className="flex items-center gap-3"><Avatar name={p.name} url={p.avatar_url} size={56} ring={accent} />
                    <div><p className="font-bold">{m?.title}</p><p className="text-sm text-muted">Today is {celebrationHeadline({ name: p.first_name, birthday: p.birthday, years: p.years })}.</p></div></div>
                  {sent[p.member_id] ? <p className="mt-3 text-sm font-semibold text-ok">Your wishes were sent. 🎉</p> :
                    <form className="mt-3 flex gap-2" action={async (f) => { const r = await sendWish(p.member_id, f); if (r.ok) setSent((s) => ({ ...s, [p.member_id]: true })); }}>
                      <label className="sr-only" htmlFor={`w-${p.member_id}`}>Your wishes for {p.first_name}</label>
                      <input id={`w-${p.member_id}`} name="message" required maxLength={280} placeholder={p.birthday ? `Happy birthday, ${p.first_name}!` : `Congratulations, ${p.first_name}!`} className="input min-w-0 flex-1" />
                      <button className="btn-primary">Send</button>
                    </form>}
                </li>;
              })}</ul>
              <button type="button" onClick={close} className="btn-ghost w-full">Close</button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
