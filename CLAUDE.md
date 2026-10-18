# CLAUDE.md

Read and follow **[AGENTS.md](./AGENTS.md)** — it is the single rulebook for this repository
(security baseline, data access, errors, validation, naming, where features go, definition of done).

Working notes for Claude specifically:

- Stay on the task you were given. Do not refactor, rename or "tidy" unrelated code.
- Before saying work is finished, run the checks in AGENTS.md section 8 and report what passed.
  If a check cannot run in your environment, say so plainly instead of assuming it passes.
- Never enter passwords, create accounts, or handle real keys for the owner; ask them to put
  secrets in `.env` or the provider dashboards themselves.
- When a database change is needed, write a new numbered migration plus its SQL test, then
  regenerate types (`npm run db:types`) — never edit an existing migration or the generated file.
- Prefer the existing helpers: `requireMember`, `friendly`, `flashQuery`/`readFlash`, `throttle`,
  `parseForm` and the zod schemas, `parseOrNull` with `jsonShapes`.
