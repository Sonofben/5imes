# AGENTS.md — rules for anyone (human or AI agent) changing 5ime

5ime is a Kora Forge product: GPS attendance for hybrid teams. Read this file before changing
anything. The rules marked **[CI]** are checked automatically and a change that breaks them
cannot merge; rules marked **[review]** are checked by the person reviewing the change.
If a rule here and the code disagree, the rule wins — fix the code or propose a change to this file.

## 1. Stack and layout

- Next.js 16 (App Router, `src/proxy.ts` is the middleware), React 19, Tailwind v4, TypeScript strict.
- Supabase: Postgres with row-level security (RLS), Auth (password, email code, TOTP two-factor), Storage (logos).
- Payments: Paystack and Moniepoint (Monnify). Maps: Leaflet + OpenStreetMap; address search: Nominatim.
- Runs as one Docker container behind the host's Nginx on a shared VPS (see `DEPLOY.md`).

```
src/app/app/          staff screens (check-in, requests)
src/app/admin/        company admin screens
src/app/console/      Global Admin (Kora Forge staff only)
src/app/api/<service>/<action>/route.ts   payments, webhooks, exports, health
src/app/auth, login, signup, onboarding   signing in and setup
src/components/       pieces used by more than one area
src/lib/              shared logic with no screen
supabase/migrations/  every database change, numbered, forward-only
supabase/tests/       SQL tests (run on a throwaway Postgres)
test/                 unit tests (node --test)
e2e/                  Playwright smoke tests
scripts/              migrate.sh, deploy.sh, gen-db-types.mjs
deploy/               Nginx files
docs/                 E2E test plan, email templates
```

## 2. Security rules (the Kora Forge baseline — applies to every Kora Forge app)

1. **Never trust an ID from the browser.** Who the caller is and which company they belong to
   come from the server session (`requireMember()`, `requireConsole()`, `auth.uid()` in SQL),
   never from a form field, URL or bound action argument. **[review]** Example: actions call
   `requireMember({ admin: true })` and use `org.id`; they do not accept `orgId`.
2. **Every table has row-level security, and no company can read another's rows.** **[CI]**
   `supabase/tests/95_rate_limits.sql` fails if any public table has RLS off;
   `supabase/tests/99_tenant_sweep.sql` signs in as every member of every company and fails if any
   row of another company is visible in any table or view, or if signed-out visitors can read anything.
3. **Private data is locked down by column.** Grant only the columns a role needs; precise
   locations, home addresses, IPs and device details live in separate tables readable only
   through functions that return the caller's own data or what their role allows. **[review]**
4. **Rate-limit everything that sends email, spends money, writes records, or touches security.** **[CI]**
   - In the database: `perform public.rate_limit_hit(bucket, subject, max, window)` as the first
     statement of the function; the subject is `'u:' || auth.uid()` or `'o:' || public.my_org_id()`.
     The list of limited functions is in `supabase/tests/95_rate_limits.sql`; add yours there.
   - In the web app: `await throttle(supabase, "<bucket>")` (`src/lib/throttle.ts`); add new buckets
     to `public.throttle()` in a migration.
   - Per IP: Nginx (`deploy/nginx/`). Sign-up, sign-in and reset are also covered by Supabase Auth
     limits and the Turnstile CAPTCHA.
   - Limits fail closed: if the check errors, the action is refused.
5. **The UI is not a lock.** Decide on the server; data a user is not entitled to never leaves the
   database. Hidden buttons and disabled fields are convenience only. Paywalls and Pro features are
   enforced in SQL (`check_in`, `guard_member_changes`, `enforce_location_plan`, `replace_schedule`). **[review]**
6. **No mass assignment.** Insert/update only named fields; validate them (section 5). Role, money,
   status, plan and ownership are server-owned: column grants and triggers stop clients setting them. **[review]**
7. **Secrets** live only in `.env` on the server (never in code, logs or the browser bundle).
   Only `NEXT_PUBLIC_*` values may reach the browser. The service-role key is used only on the
   server, only after checking who the user is. **[CI]** gitleaks scans every push and the full history.
8. **Every message shown from a link is signed** (`flashQuery()` / `readFlash()` in `src/lib/flash.ts`).
   Never render text taken straight from the URL. **[CI]** e2e test "a message typed into a link is not shown".
9. **Content-Security-Policy** with a per-request nonce (`src/lib/csp.ts`, set in `src/proxy.ts`).
   A new outside service must be added there; never add `'unsafe-inline'` to `script-src`. **[CI]**
10. **Visitors without an account** (reception tablet, the visitor's own phone): a paired tablet is identified only
    by its random token in an httpOnly cookie; a visitor only by the unguessable token in their pass link or the
    office's poster link. `/api/kiosk/*` and `/api/visit/*` pass those tokens to `kiosk_*`, `visit_*` and `walkin_*`
    functions (service_role only), which derive the company and office from them. Never add one that takes a company,
    office or visit id from the request. Public forms are rate-limited per device (hashed IP) and per link, list no
    staff, and nothing is let in until reception admits it (unless the company turns that off). Every action on visitor
    data is written to `visitor_audit` without visitor names. **[CI]** `supabase/tests/96_visitors.sql`, `97_visitor_desk.sql`.
11. **Uploads**: check size, the declared type and the file's first bytes; store under a path the
    server chooses; only the server writes the stored URL. **[review]**
12. **Webhooks** verify the provider's signature; payments are confirmed by asking the provider,
    and the amount must equal what we reserved. **[review]**

## 3. Reading and writing data

- **Server pages read directly** with the user's client from `requireMember()`; RLS decides what they see.
- **Anything with rules goes through a database function (RPC)**: check-in, approvals, invites,
  plan changes, console actions. The rules live in SQL so they hold for every caller.
- **Client components** call RPCs with `createClient()` from `src/lib/supabase/client.ts` only for
  live browser actions (GPS check-in, presence, requests).
- **API routes** (`src/app/api/...`) are for outside services. Only they and a few server actions use
  `createAdminClient()`, and only after verifying the user.
- **Types**: the Supabase clients are typed with `src/lib/database.types.ts`, generated from the
  migrations by `npm run db:types`. **[CI]** fails if it is out of date. Do not edit it by hand.
- **No `as SomeType` on database results.** **[review]** Use the generated types. For jsonb results,
  parse with a schema from `src/lib/jsonShapes.ts` (or `src/lib/schemas.ts` for money results);
  **[CI]** `test/json-shapes.test.mjs` checks those schemas against the real function output.

## 4. Errors and messages

- Database refusals use `raise exception 'Plain sentence for the user.'` — that text is shown as written.
  Rate limits raise SQLSTATE `KF429`.
- In the app, turn any error into a user message with `friendly(error, "where")` (`src/lib/errors.ts`).
  It passes our own messages through, maps common codes to plain sentences, and for anything else
  logs the full error with a reference and shows "Something went wrong… (ref ABC123)".
  **Never show `error.message` from Postgres, Supabase or a provider directly.** **[review]**
- Throw `UserError` when app code has a message meant for the user.
- Server actions redirect back with `flashQuery({ msg })` or `flashQuery({ error })`.
- API routes return the right status: `statusFor(error)` gives 429 / 400 / 403 / 500.
- Logging: `log.info/warn/error` and `logError()` from `src/lib/log.ts` (JSON lines in `docker logs`,
  optional GlitchTip/Sentry via `ERROR_TRACKING_DSN`). Never log passwords, tokens, keys, full card or
  account numbers; the logger also strips fields with those names.
- Unhandled server errors are logged by `src/instrumentation.ts` with the reference shown on the error page.

## 5. Validating input

- Every form and request body is validated on the server with zod (`src/lib/schemas.ts`:
  `parseForm()`, `email`, `uuid`, `staffRole`, `seats`, `latitude`, `officeRadius`, …). **[review]**
- Cap the length of every text field. Reject unknown enum values. Coerce numbers explicitly.
- The database re-checks what matters (constraints, functions); app validation is for clear
  messages and early refusal, not instead of the database.

## 6. Naming

| What | Style | Example |
|---|---|---|
| Components and their files | PascalCase | `WorkElsewhere.tsx` |
| Library files | lowercase, one topic each | `lib/geocode.ts` |
| Functions, variables | camelCase, verb first | `requireMember`, `loadPlans` |
| Server actions | `actions.ts` next to the page | `admin/requests/actions.ts` |
| URLs and folders | lowercase-with-hyphens | `/admin/attendance-corrections` |
| Tables, columns | snake_case, plural tables | `work_location_requests` |
| Database functions | snake_case, verb first; params `p_` | `decide_work_elsewhere(p_request …)` |
| Global Admin functions | `console_` prefix | `console_set_plan` |
| Migrations | `NNNN_what_it_does.sql` | `0015_leave_requests.sql` |
| Database tests | number by area | `supabase/tests/100_leave.sql` |
| Env vars | UPPER_SNAKE | `PAYSTACK_SECRET_KEY` |

On screen say "company" and "staff"; in code it is `org` and `member`.

## 7. Adding a feature (checklist)

1. **Migration** `supabase/migrations/NNNN_name.sql` (wrapped in `begin; … commit;`):
   - tables with RLS enabled and policies;
   - explicit grants (newer Supabase grants nothing by default — forgetting this gives "permission denied");
   - functions `security definer set search_path = pg_catalog, public, pg_temp`, `revoke all … from public, anon`, then grant to the roles that need them;
   - a rate limit on anything that writes, sends or spends;
   - backward compatible with the currently deployed app (add, don't rename or drop in the same release).
2. **Tests** `supabase/tests/NN_name.sql`: who can and cannot do it, including another company and signed-out visitors.
3. `npm run db:types` (needs a database with all migrations — see `scripts/gen-db-types.mjs`).
4. **Screen**: `src/app/<area>/<feature>/page.tsx` + `actions.ts`; client parts in the same folder.
5. **Shared** logic in `src/lib/` only when a second place needs it; shared UI in `src/components/`.
6. **Navigation**: `admin/AdminNav.tsx` or `console/ConsoleNav.tsx`.
7. **Docs**: the migration in `DEPLOY.md` if it needs a manual step; a section in `docs/E2E_TEST_PLAN.md`.

## 8. Definition of done

A change is done only when all of these pass locally or in CI:

```bash
npm run lint && npx tsc --noEmit && npm test            # app: lint, types, unit tests
scripts/test-db.sh --types                               # all migrations + SQL tests + tenant sweep, then types
npm run build && npx playwright test e2e/public.spec.ts  # build + smoke tests (needs the standalone copy step, see CI)
```

Do not mark work finished with failing or skipped checks, and do not weaken a test to make it pass.

## 9. Releasing

- `scripts/deploy.sh [tag]` on the VPS: fetch → `scripts/migrate.sh` → build → health check → automatic
  rollback of the app if `/api/health` doesn't come up. Migrations are recorded in
  `supabase_migrations.schema_migrations` and never run twice.
- A migration file is never edited after it has been deployed; fix forward with a new number.
- After a release, check `docker logs fivetime-web --tail 50` and Global Admin → Security.

## 10. Never

- Never disable RLS, add `using (true)` policies, or grant table writes to `anon`.
- Never put a secret in code, a commit, a log line or a `NEXT_PUBLIC_` variable.
- Never trust a client-sent id, role, price, amount or status.
- Never show raw error text, or text from the URL, to a user.
- Never call the service-role client before checking who the user is.
- Never edit a deployed migration, or `src/lib/database.types.ts` by hand.
- Never add `'unsafe-inline'` or `'unsafe-eval'` to the production `script-src`.
