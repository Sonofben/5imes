# Deploying 5ime on the shared Contabo VPS (Docker)

The VPS is shared, and **CACTS is live on it and must not be disturbed.**

- **CACTS** stays exactly as it is. We never touch its files, process, database or Nginx config.
- **New apps live under `/opt/apps/`**, each in its own Docker container with a memory/CPU cap:
  - 5ime now
  - GBIN later
- **Each container listens only on `127.0.0.1:<port>`**, so it is invisible from the internet.
- **The host's Nginx is the one public front door.** For each app we *add* a new site file that forwards its address to its container. Nothing is edited in CACTS's site file.

**Port register:** keep this list updated.

| App | Folder | Local port | Public address |
|---|---|---|---|
| CACTS | (existing, untouched) | (existing) | (existing) |
| 5ime | `/opt/apps/5ime` | **3005** | `https://<ip-with-dashes>.sslip.io` (demo) → `5ime.ng` later |
| GBIN | `/opt/apps/gbin` | 3006 (reserved) | — |

**Why this is safe for CACTS:**
- **Installing Docker** doesn't restart Nginx or any running app.
- **The 5ime container** can use at most 512 MB RAM and 1 CPU.
- **Nginx reload is graceful.** It only happens after `nginx -t` confirms the config is valid, and existing connections aren't dropped.
- **Certbot** only edits the new 5ime site file.

---

## 0. Look before touching anything (2 min, read-only)

Run this on the VPS and keep the output. It shows what is running, which ports are taken, and how much RAM and disk are free.

Open `deploy/vps-check.sh` on GitHub, copy its contents, and on the VPS:
```bash
nano ~/vps-check.sh      # paste, save
bash ~/vps-check.sh
```

**Stop and check with the team if:**
- **port 3005 is already in use**, or
- **free RAM is under about 1.5 GB.** The first image build needs roughly 1–2 GB. If RAM is short, build at a quiet time or add swap.

## 1. Supabase (≈15 min, one-time)

1. **Create the project.** Go to <https://supabase.com>, create a new project, and pick the region closest to Nigeria that's offered.
2. **Run the schema.** Open **SQL Editor** and run these files **in order**, one at a time, waiting for "Success" each time:
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_security_billing_attendance.sql`
   3. `supabase/migrations/0003_payment_history_attendance_corrections.sql`
   4. `supabase/migrations/0004_attendance_device_privacy.sql`
   5. `supabase/migrations/0005_pay_per_term.sql`
   6. `supabase/migrations/0006_console_branding_support.sql`
   7. `supabase/migrations/0007_passwords_mfa_recovery.sql`
   8. `supabase/migrations/0008_auth_routing_and_recovery_hardening.sql`
   9. `supabase/migrations/0009_security_status_fix.sql`
   10. `supabase/migrations/0010_explicit_api_grants.sql`
   11. `supabase/migrations/0011_work_elsewhere_line_managers_maps.sql`
   12. `supabase/migrations/0012_global_admin.sql`
   13. `supabase/migrations/0013_reserved_links.sql`
   14. `supabase/migrations/0014_rate_limits_and_hardening.sql`
   15. `supabase/migrations/0015_premium_visitor_management.sql`
   16. `supabase/migrations/0016_visitor_checkin_desk_audit.sql`
   17. `supabase/migrations/0017_brand_kit.sql`
   18. `supabase/migrations/0018_plan_tiers.sql`
   19. `supabase/migrations/0019_brand_level.sql`
   20. `supabase/migrations/0020_schedule_automation.sql`

   For a **new** project, the easier way is step 8's `scripts/migrate.sh`, which runs them all in order and records them.
   Never run the files in `supabase/tests/` there. They are for throwaway test databases.
3. **Copy the keys.** In **Project Settings → API**, copy:
   - `Project URL`
   - the `anon public` key
   - the `service_role` key
4. **Set the auth URLs.** In **Authentication → URL Configuration**:
   - **Site URL:** your canonical HTTPS address, e.g. `https://5imes.koraforge.com.ng` (no trailing slash). Or, for a demo on a bare IP, `https://<ip-with-dashes>.sslip.io`.
   - **Redirect URLs:** add `<Site URL>/auth/callback**` (the two stars at the end matter: they allow `?type=invite` and the other variants)
5. **Email + password sign-in** is now the normal route.
   - In **Authentication → Providers**, make sure *Email* is enabled with *Confirm email* ON. The signup page sends a verification link; invites use `inviteUserByEmail` and land on `/auth/invite` for the staff member to pick their own password.
   - *Multi-Factor Authentication* (TOTP) must be enabled under **Authentication → Providers → Multi-Factor Authentication** — turn on *TOTP*. Admins and owners are required by the server guard to enrol before they can reach admin tools.
   - **Use Resend for email delivery.** The built-in Supabase mailer caps at a few per hour and ends up in spam. Under **Authentication → Emails → SMTP Settings**:
     - *Enable Custom SMTP:* on
     - *Host:* `smtp.resend.com`
     - *Port:* `465`
     - *Username:* `resend`
     - *Password:* your Resend API key (starts with `re_`)
     - *Sender email:* a verified address on your Resend domain (e.g. `no-reply@koraforge.com.ng`)
     - *Sender name:* `5ime`
   - **Email templates (required).** Still under *Emails → Templates*, replace each template with the matching file from `docs/email-templates/` (open the file, copy everything, paste into the *Message body*, save). Set these subjects:

     | Supabase template | File | Subject |
     |---|---|---|
     | Confirm signup | `confirm-signup.html` | Confirm your email for 5ime |
     | Invite user | `invite-user.html` | You’re invited to 5ime |
     | Magic Link | `magic-link.html` | Your 5ime sign-in code |
     | Change Email Address | `change-email.html` | Confirm your new 5ime email |
     | Reset Password | `reset-password.html` | Reset your 5ime password |
     | Reauthentication | `reauthentication.html` | Your 5ime confirmation code |

     These links use `token_hash`, so they work on any phone or computer (not only the one that asked), and invitations work at all. The invite email names the company automatically.
6. **Session policy.** The app relies on Supabase's standard session: a 1-hour JWT with a refresh token rotated on use. In **Authentication → Policies** (or *Sessions*) you can tighten this: `Access token lifetime` 3600s is a sensible default; `Refresh token lifetime` 2592000s (30 days) means a device that goes two inactive weeks still refreshes silently. Admins additionally must satisfy TOTP (aal2) before `/admin/*` server-side; aal2 is a session-level fact, so it persists until the user signs out or Supabase rotates the session.

### Role routing and MFA grace (from 0008 onward)

The post-login redirect is driven by **one SQL function**,
`public.post_auth_destination()`, which `/start` reads and obeys. Precedence:

1. **Platform staff** (`platform_staff` row) → `/console`, no matter what their
   company role is. A Kora Forge operator is a platform operator first.
2. **Active company admin** (`owner` / `admin` / `manager`, status `active`) → `/admin`.
3. **Active member** → `/app`.
4. **Pending / disabled** → `/pending` (with `?disabled=1` suffix when disabled).
5. **No org yet** (company domain, no `organizations` row) → `/onboarding`.
6. **Public email** (gmail, yahoo, …) → `/start` with a "use your company email" message.
7. **Signed out** → `/login`.

The mapping is deliberately in the database and runs as `SECURITY DEFINER` so a
client cannot flip their destination by editing `user_metadata` or cookies.
`post_auth_destination()` and its upstream `my_primary_role()` ship in
migration 0008.

**Recovery-code grace window.** When an admin on an `aal1` session consumes
a one-time recovery code via `/api/security/recovery-signin`, the DB writes
a `recovery_used` event tagged with the current `session_id` from the JWT.
`requireMember()` then allows that one session into `/admin/*` on `aal1` for
10 minutes so the admin can re-enrol TOTP. The event is bound to the exact
session that proved the code; a different session (or the same user signing
in again later) cannot ride a stale event through.

**Direct-RPC safety.** `log_security_event()` rejects any attempt by an
authenticated client to post `recovery_used` or `recovery_regenerated`
events — those kinds are only written by the trusted
`verify_and_consume_recovery_code()` and `replace_recovery_codes()` RPCs.
`replace_recovery_codes()` additionally refuses an `aal1` caller inside the
database, not only in the API route.

## 2. Install Docker (≈5 min, skip if `vps-check` shows Docker)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker run --rm hello-world
```

`hello-world` should print "Hello from Docker!". It only *adds* Docker and doesn't restart anything else.

## 3. Get the code onto the VPS (≈5 min)

The repo is private, so give the VPS a read-only deploy key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/5imes_deploy -N "" -C "vps-5imes"
cat ~/.ssh/5imes_deploy.pub
```

1. Copy the key it prints.
2. On GitHub, go to **Sonofben/5imes → Settings → Deploy keys → Add deploy key**.
3. Paste it, leave **Allow write access** unticked, and save.

```bash
printf 'Host github-5imes\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/5imes_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
sudo mkdir -p /opt/apps && sudo chown $USER /opt/apps
git clone github-5imes:Sonofben/5imes.git /opt/apps/5ime
cd /opt/apps/5ime
```

## 4. Configure and start the container (≈10 min, mostly build time)

```bash
cp .env.example .env
nano .env
```

Fill in `.env` with:
- **Site address:** `NEXT_PUBLIC_SITE_URL=https://<ip-with-dashes>.sslip.io`
- **Supabase:** the three values from step 1
- **Paystack:** leave `PAYSTACK_SECRET_KEY` and `PAYSTACK_SUBACCOUNT` empty for now (billing shows as not connected)

```bash
chmod 600 .env
docker compose up -d --build
docker compose ps
curl -sI http://127.0.0.1:3005 | head -1
```

1. **`docker compose up -d --build`** builds and starts the container. The first build takes a few minutes.
2. **`docker compose ps`** should show `fivetime-web` as **Up**, and **(healthy)** after about 30 seconds.
3. **`curl`** should print `HTTP/1.1 200 OK`.

At this point 5ime is running but still private.

## 5. Open the front door: Nginx + HTTPS (≈5 min)

HTTPS is mandatory: phones block GPS on `http://`, so check-in won't work without it.

```bash
HOST=203-0-113-5.sslip.io     # ← your server IP with dashes
sudo cp deploy/nginx-5ime.conf /etc/nginx/sites-available/5ime
sudo sed -i "s/SERVER_NAME/$HOST/" /etc/nginx/sites-available/5ime
sudo ln -s /etc/nginx/sites-available/5ime /etc/nginx/sites-enabled/5ime
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d $HOST --redirect -m you@yourcompany.com --agree-tos -n
```

1. The first three commands only *add* the new 5ime site file.
2. **`nginx -t && systemctl reload`** reloads only if the config test passes. If it fails, nothing is reloaded and CACTS keeps running.
3. **Certbot** gets the HTTPS certificate. It only edits the 5ime site file.

If Certbot isn't installed: `sudo apt-get install -y certbot python3-certbot-nginx`.

**Confirm CACTS is still fine.** Open its site in a browser, and run `sudo nginx -t` again.

Then open `https://<ip-with-dashes>.sslip.io`. You should see the 5ime landing page.

## 6. Test it end to end (≈15 min)

1. **Create the company.** On a laptop, sign in with a **company email** (not Gmail) and create the company. This starts the 14-day trial.
2. **Add the office.** Go to **Locations → Use my current location** while at the office, or paste coordinates from Google Maps.
3. **Set the schedule.** Under **Schedule**, choose office and home days.
4. **Invite a staff member.** Under **Staff**, invite a colleague with the same email domain.
5. **Staff signs in on a phone.** They open the site, sign in, allow location, and tap **Check in**.
6. **Check it on the dashboard.** The admin should see it on **Today**, and in **Reports → Download CSV**.
7. **Pin a home location.** From home, staff tap **pin this location**, and the admin approves it under **Staff**.


## 7. Make yourself the first Global admin (one-time)

1. Supabase → **Authentication → Users → Add user → Create new user**: your Kora Forge email and a strong password, tick **Auto confirm user**.
   (Don't use the 5ime sign-up page for this — that creates a company workspace.)
2. In the Supabase SQL Editor run (use your email):
   ```sql
   insert into public.platform_staff (user_id, email, role)
   select id, email, 'owner' from auth.users where email = 'you@koraforge.com';
   ```
3. Sign in at `https://<host>/login` and open `https://<host>/console`. The first time, scan the QR code with an authenticator app and enter the 6-digit code. Two-factor is required every sign-in.
4. Add the rest of the team from **Global Admin → Team** (no more SQL). Roles: Global admin, Support admin, Billing admin, Read-only admin.
5. Logo uploads use Supabase Storage: the app creates a public `logos` bucket automatically on the first upload (needs `SUPABASE_SERVICE_ROLE_KEY`).

## 8. Releases with migration tracking and automatic rollback (from 0014 on)

From now on every release goes through `scripts/deploy.sh`. It applies only the migrations that
have not run yet (recording each in `supabase_migrations.schema_migrations`), builds, starts, checks
`/api/health`, and puts the previous version back if the new one doesn't come up healthy.

**One-time setup**

1. **Database connection string.** Supabase → **Connect** (top of the project) → **Session pooler** →
   copy the URI and put your database password in it. Add it to `/opt/apps/5ime/.env` yourself:
   ```
   DATABASE_URL=postgresql://postgres.<ref>:<your-db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   It stays on the server only. (`chmod 600 .env` if you haven't.)
2. **Tell the tracker what you already ran by hand.** First check which of 0011–0013 are in the
   database — in the Supabase SQL Editor run:
   ```sql
   select to_regclass('public.work_location_requests') is not null as has_0011,
          to_regclass('public.platform_plans')        is not null as has_0012,
          'signup' = any (public.reserved_slugs())                as has_0013;
   ```
   Record everything up to the last one that shows `true` — for example if all three are true:
   ```bash
   cd /opt/apps/5ime && scripts/migrate.sh --baseline 0013
   ```
   (If only 0011 is true, use `--baseline 0011`; the deploy will then run 0012, 0013, 0014 for you.)
3. `scripts/migrate.sh --status` lists what is applied and what is pending.

**Every release**
```bash
cd /opt/apps/5ime
scripts/deploy.sh            # latest main
scripts/deploy.sh v2026.10.20   # or a tagged release
```
`deploy.sh` leaves the folder on the released commit (a "detached" checkout); that's expected —
always release with `deploy.sh` rather than `git pull`.

## 9. Request limits in Nginx (per visitor IP)

```bash
cd /opt/apps/5ime
sudo cp deploy/nginx/5ime-limits-http.conf   /etc/nginx/conf.d/5ime-limits.conf
sudo cp deploy/nginx/5ime-limits-server.conf /etc/nginx/snippets/5ime-limits.conf
sudo nano /etc/nginx/sites-available/5ime
```
In the `server { … }` block that has `listen 443` (the one Certbot added), add this line just
above `location / {`:
```
    include /etc/nginx/snippets/5ime-limits.conf;
```
Then:
```bash
sudo nginx -t && sudo systemctl reload nginx
for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code} " https://5imes.koraforge.com.ng/api/health; done; echo
```
You should see `200`s and then `429`s (the limit working). If `nginx -t` fails, remove the
`include` line and reload — nothing else changes. CACTS's site file is not touched.

## 10. CAPTCHA (Cloudflare Turnstile) on sign-up, sign-in and password reset

The order matters: the app must send the CAPTCHA before Supabase starts requiring it.

1. Cloudflare dashboard → **Turnstile** → **Add widget**: name `5ime`, hostname `5imes.koraforge.com.ng`,
   widget mode **Managed**. Copy the **Site key** and the **Secret key**. (Your domain doesn't have to
   be on Cloudflare for this.)
2. In `/opt/apps/5ime/.env` add the **site** key only:
   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...
   ```
   and release: `scripts/deploy.sh` (the site key is built into the page, so it needs a build).
3. Supabase → **Authentication → Attack Protection** → enable **CAPTCHA protection**, provider
   **Turnstile**, paste the **secret** key, save.
4. Test: sign out, sign in, request a one-time code, and use "Forgot password". Most people never
   see a challenge; occasionally a checkbox appears.
5. While there: Supabase → **Authentication → Rate Limits** — keep email sending low (for example
   30 per hour) and sign-in/verification limits at Supabase's defaults or lower.

To turn CAPTCHA off again: disable it in Supabase first, then empty the site key and release.

## 11. Optional: error tracking

Errors are always written to `docker logs fivetime-web` as JSON lines with a reference code (the
same code users see on screen). To also collect them in a dashboard, run GlitchTip (free,
self-hosted) or use Sentry, and put the project DSN in `.env` as `ERROR_TRACKING_DSN=…`, then `docker compose up -d`.

## 12. Visitor management (Pro and Premium)

Migrations 0015 and 0016 add the **Visitors** module (header switch: *Attendance | Visitors*).
Migration 0018 sets the October 2026 plans (change prices any time in Global Admin → Plans & pricing):

| | Basic ₦300 | Pro ₦600 | Premium ₦1,000 |
|---|---|---|---|
| Staff | up to 15 | unlimited | unlimited |
| Branding | logo in the app | full brand (0019) | full brand |
| Visitors | — | one office, 100 visits a month | every office, unlimited, tablet, roll call, blocklist, reports |

The limits are enforced by the database (triggers on members, payments, subscriptions, visits and
visitor_links). Companies on a free trial get everything. `scripts/deploy.sh` applies the migrations.

How it works:
- **Invited visitors** get an email with the office address, a map, their code and an **“I’ve arrived — check in”**
  button. On arrival they tap it on their phone (the code is filled in), confirm their details and accept the
  rules and privacy notice. Reception then admits them.
- **Walk-in visitors** scan the **QR poster** at reception, fill in a short form on their phone and wait.
- **Reception** works from **Visitors → Desk** on a laptop or tablet: the waiting queue (Admit / Turn away),
  find a visitor by code or by scanning the QR on their phone, expected today, on site now. The host is emailed
  when their visitor is let in. Staff who work at reception get **desk access** (Visitors → Settings) without being admins.
- A **reception tablet** (`/kiosk`) is still available for visitors without a smartphone.

Setup:
1. **Visitor emails.** Invitations and host alerts are sent with Resend's API. In `/opt/apps/5ime/.env` add
   (the same Resend account as Supabase's SMTP):
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM=5imes <no-reply@5imes.click>
   ```
   The sender must be on a domain verified in Resend. Then `docker compose up -d` (no rebuild needed).
   Without these, invitations still work — the desk shows the visitor's code to pass on.
2. **Poster.** Visitors → Settings → *Visitor link and QR poster* → **Create link** → **Print poster** for each office.
   If a link is ever shared where it shouldn't be, **Make a new link** and print the new poster (the old one stops working).
3. **Reception staff.** Visitors → Settings → *Reception desk access* → **Give desk access** to the people at reception.
4. **Privacy (NDPA).** Visitors → Settings: edit the privacy notice, how long details and photos are kept, and
   whether reception must admit every visitor (on by default). Reports → *Audit trail* and *A visitor's data request*
   are the records to show how visitor data is handled.
5. **Optional tablet.** Visitors → Settings → *Reception tablets* → **Add tablet**; on the tablet open `/kiosk` and type
   the code (valid 15 minutes). Photos (off by default) go to the private Storage bucket `visitor-photos`.

## 13. Keeping the site up (target: 99%+ of the time)

99% uptime allows about 7 hours of downtime a month; 99.5% about 3.5 hours. One VPS can meet
that if problems are noticed and fixed in minutes, not hours. Four layers do that:

| Layer | Fixes | Already in place? |
|---|---|---|
| Docker `restart: unless-stopped` | the app crashing, the server rebooting | Yes (docker-compose.yml) |
| Watchdog, every minute | the app hung but still "running"; Nginx stopped | Install below |
| Outside uptime monitor | anything else — you get an alert within minutes | Set up below |
| Smarter offline page | tells users whether *their* internet or *our* site is down, and reloads itself when it's back | Yes (from this release) |

### 13a. Start everything on boot (one-time, 1 min)

```bash
sudo systemctl enable docker nginx
systemctl is-enabled docker nginx      # both: enabled
```

### 13b. Watchdog (one-time, 2 min)

```bash
cd /opt/apps/5ime
sudo cp deploy/systemd/5ime-watchdog.service deploy/systemd/5ime-watchdog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now 5ime-watchdog.timer
systemctl list-timers 5ime-watchdog.timer   # shows the next run
sudo systemctl start 5ime-watchdog.service && journalctl -t 5ime-watchdog -n 5   # run it once now
```

What it does: if `/api/health` doesn't answer three minutes in a row, it restarts the
container; if Nginx is stopped it starts it (only if `nginx -t` passes); it warns when the disk
is 90% full or memory is nearly gone. It stands aside while `scripts/deploy.sh` runs.
See what it has done: `journalctl -t 5ime-watchdog --since "7 days ago"`.

### 13c. Outside uptime monitor and alerts (one-time, 5 min, free)

The watchdog can't help if the whole VPS or its network is down — only something outside can
see that. Use UptimeRobot (uptimerobot.com) or Better Stack (betterstack.com); both have free plans.

1. Create the account yourself.
2. Add an **HTTP(s)** monitor: URL `https://5imes.koraforge.com.ng/api/health`, every **1–5 minutes**
   (free UptimeRobot is 5), and for UptimeRobot add a keyword check for `"ok":true`.
3. Alert contacts: your email, plus the mobile app (push) or Telegram so you see it quickly.
4. Optional: a public status page you can share with clients, and the monitor's monthly
   uptime % is your proof of the 99% figure.

Add one monitor per app on this VPS (CACTS too) — when every app goes down together, it's the
server or Contabo, not the app.

### 13d. Habits that prevent most outages

- Deploy with `scripts/deploy.sh` only — it checks health and rolls back by itself. Expect
  5–15 seconds of downtime while the new container starts; deploy outside working hours.
- After editing Nginx, always `sudo nginx -t` **before** `sudo systemctl reload nginx`.
- Once a month: `df -h /`, `free -h`, `docker system prune -f` (removes old images), and
  `sudo apt upgrade` followed by a reboot at a quiet time.
- Supabase's free plan has no uptime promise. When paying clients rely on 5ime, move the
  project to Supabase Pro.
- Beyond ~99.9% you need a second server and a load balancer — not worth it at this stage.

## 14. Staging: a test copy at staging.5imes.click

Staging is a second, complete copy of 5imes with **its own database**. New features go there
first; you test them; only then do they go to the live site. Nothing you do on staging touches
real companies or real data.

| | Live | Staging |
|---|---|---|
| Address | `https://5imes.click` | `https://staging.5imes.click` |
| Folder on the VPS | `/opt/apps/5ime` | `/opt/apps/5ime-staging` |
| Container / port | `fivetime-web` / 3005 | `fivetime-staging-web` / 3006 |
| Supabase project | the live one | a **separate free project** |
| Payments | live keys | Paystack **test** keys (or none: demo mode) |
| Looks like | normal | yellow "STAGING" bar on every page, `[Staging]` in email subjects, hidden from Google |

The VPS needs about 800 MB more memory for the second container. Check first: `free -h`
("available" should be over 1.5 GB). If it is tight, stop staging when you are not testing:
`cd /opt/apps/5ime-staging && docker compose stop`.

### 14a. One-time setup (≈30 min)

1. **Supabase:** create a new project named `5imes-staging` (free plan). Then repeat section 1
   steps 3–5 for it, with Site URL `https://staging.5imes.click` and redirect URL
   `https://staging.5imes.click/auth/callback**`. Same Resend SMTP settings and email templates.
   (Google sign-in is optional on staging; email + password is enough for testing.)
2. **DNS:** add an `A` record `staging` → `185.214.134.44`.
3. **Code** on the VPS:
   ```bash
   sudo git clone github-5imes:Sonofben/5imes.git /opt/apps/5ime-staging   # same deploy key as live
   cd /opt/apps/5ime-staging
   cp .env.example .env && chmod 600 .env && nano .env
   ```
   In `.env` fill in the **staging** Supabase URL and keys, the staging `DATABASE_URL`, and set:
   ```
   NEXT_PUBLIC_SITE_URL=https://staging.5imes.click
   APP_ENV=staging
   COMPOSE_PROJECT_NAME=fivetime-staging
   CONTAINER_NAME=fivetime-staging-web
   IMAGE_NAME=fivetime-staging-web
   APP_PORT=3006
   ```
   Leave `PAYSTACK_SECRET_KEY` empty (demo mode) or use a Paystack **test** key (`sk_test_…`).
   `RESEND_API_KEY` and `EMAIL_FROM` can be the same as live.
4. **Database and app:** `scripts/deploy.sh` — it creates every table in the new project and starts the container.
5. **Nginx + HTTPS:**
   ```bash
   sudo cp deploy/nginx/5ime-limits-http.conf /etc/nginx/conf.d/5ime-limits.conf   # harmless if already there
   sudo cp deploy/nginx-5ime-staging.conf /etc/nginx/sites-available/5ime-staging
   sudo ln -s /etc/nginx/sites-available/5ime-staging /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d staging.5imes.click
   ```
6. **First admin:** sign up on staging with a company email, then make yourself Global admin as in section 7
   (in the staging project's SQL editor). Use made-up companies and people for testing.

### 14b. Every new feature

```bash
# 1. put the new version on staging (any branch, tag or commit)
cd /opt/apps/5ime-staging && scripts/deploy.sh origin/main
# 2. test it at https://staging.5imes.click (docs/E2E_TEST_PLAN.md)
# 3. when you are happy, release the SAME version to live
cd /opt/apps/5ime && scripts/deploy.sh <the commit staging printed, e.g. 3f2a9c1>
```

Releasing the exact commit you tested (not "whatever main is now") means live gets precisely
what you approved. Staging's database gets each migration first, so a migration that fails
fails there, not on live.

To wipe staging's test data and start clean: delete and recreate the `5imes-staging` project in
Supabase, update its keys in `.env`, and run `scripts/deploy.sh` again.

## Everyday operations

| Task | Command (in `/opt/apps/5ime`) |
|---|---|
| Deploy an update | `scripts/deploy.sh` |
| Pending migrations | `scripts/migrate.sh --status` |
| Health | `curl -s http://127.0.0.1:3005/api/health` |
| Logs | `docker compose logs -f --tail=100` |
| Restart | `docker compose restart` |
| Stop (CACTS unaffected) | `docker compose down` |
| Resource use | `docker stats --no-stream` |
| Clean old images | `docker image prune -f` |

The container restarts automatically after a crash or a server reboot.

## Adding the next app (e.g. GBIN)

1. Clone it into its own folder: `/opt/apps/gbin`.
2. Give it its own `docker-compose.yml` bound to `127.0.0.1:3006`, with its own memory cap.
3. Add its own Nginx site file and certificate.

Each app stays in its own house: one can be rebuilt or stopped without touching the others.

## Later: real domain, sign-in providers, payments

- **Domain:** in Cloudflare or your registrar's DNS, add `A @ → VPS IP` and `A www → VPS IP`. Then:
  1. Add the domain to the `server_name` line in `/etc/nginx/sites-available/5ime`.
  2. Run `certbot --nginx -d 5ime.ng -d www.5ime.ng`.
  3. Update `NEXT_PUBLIC_SITE_URL` in `.env`, then rebuild: `docker compose up -d --build`.
  4. Update the Supabase Site URL and Redirect URLs.
- **Microsoft sign-in:**
  1. In Azure, go to **App registrations → New registration** and choose multi-tenant.
  2. Set the redirect to `https://<project-ref>.supabase.co/auth/v1/callback`.
  3. Create a client secret.
  4. In Supabase, go to **Auth → Providers → Azure** and paste in the ID and secret.
- **Google sign-in:**
  1. In Google Cloud, create an OAuth client of type **Web**, with the same Supabase callback as the redirect.
  2. In Supabase, go to **Auth → Providers → Google** and paste in the ID and secret.
- **Paystack:**
  1. Put the Kora Forge secret key in `PAYSTACK_SECRET_KEY`, and the subaccount code (`ACCT_…`) in `PAYSTACK_SUBACCOUNT`.
  2. Set the webhook to `https://<host>/api/paystack/webhook`.
  3. Run `docker compose up -d` to apply.
- **Moniepoint (Monnify)** — card, bank transfer and USSD; one-off payment per term (no automatic renewal):
  1. In the Monnify dashboard, copy the **API Key**, **Secret Key** and **Contract Code** (Developer → API Keys & Contracts). Start with the **sandbox** keys.
  2. In `/opt/apps/5ime/.env` add:
     ```
     MONNIFY_BASE_URL=https://sandbox.monnify.com
     MONNIFY_API_KEY=...
     MONNIFY_SECRET_KEY=...
     MONNIFY_CONTRACT_CODE=...
     ```
  3. In Monnify → Settings → Webhook URLs, set the **transaction completion** webhook to `https://<host>/api/monnify/webhook`.
  4. Run `docker compose up -d` (no rebuild needed for these). The Billing page now shows **Pay with Moniepoint**.
  5. Test with a sandbox card or transfer. When it works, switch to the **live** keys and `MONNIFY_BASE_URL=https://api.monnify.com`, then `docker compose up -d` again.
  - If both Paystack and Moniepoint are set, admins see both buttons. Automatic card renewal stays a Paystack-only option.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `docker compose ps` not healthy | Run `docker compose logs --tail=100`. Usually a typo in `.env`. |
| "Location permission is blocked" | Use the **https** address. In the phone's browser settings, allow Location for the site. |
| 502 Bad Gateway, and `/var/log/nginx/error.log` says "upstream sent too big header" | The 5ime site file needs bigger header buffers: add `proxy_buffer_size 32k; proxy_buffers 8 32k; proxy_busy_buffers_size 64k;` inside its `server { … }` blocks, then `sudo nginx -t && sudo systemctl reload nginx`. |
| "Something went wrong (ref ABC123)" | `docker logs fivetime-web 2>&1 \| grep ABC123` shows the full error. |
| "Too many attempts" for a real user | A rate limit was reached. Global Admin → Security → "Limits reached" shows who and which limit; it clears by itself when the window ends. |
| "The security check didn't complete" | Turnstile couldn't run (blocked script or ad blocker). Check the site key in `.env` matches the hostname, and that Supabase has the matching secret key. |
| Deploy rolled back | `deploy.sh` prints the last log lines. Fix and run it again; the database migrations stay applied. |
| Magic link → "Sign-in failed" | Supabase **Redirect URLs** must include `https://<host>/auth/callback`, and `NEXT_PUBLIC_SITE_URL` must match exactly. Rebuild after changing it. |
| Emails not arriving | Built-in Supabase mailer limit hit. Add custom SMTP. |
| Check-ins always "Outside approved locations" | Re-pin the office from inside the building, or raise its radius (Pro). |
| `nginx -t` fails after adding 5ime | Run `sudo rm /etc/nginx/sites-enabled/5ime && sudo nginx -t`. This puts Nginx back exactly as it was for CACTS. |
| Users see "We can’t reach 5ime right now" | Their internet works but the site didn’t answer. Run `journalctl -t 5ime-watchdog -n 20`, `docker compose ps`, `sudo systemctl status nginx`, and check the uptime monitor’s history. |

## 15. Schedule automation and holidays

Migration 0020 adds automatic check-in, closing-time check-out, overtime and holidays
(admins: **Settings → Automatic check-in and check-out**, **Holidays**; Global Admin: **Holidays**).

- The rules run every 5 minutes inside the database with **pg_cron**. In Supabase, open
  **Database → Extensions**, search **pg_cron** and switch it on, then run `scripts/deploy.sh` again
  (the migration schedules the job if pg_cron is there). Check it with:
  `select jobname, schedule from cron.job;` → `5ime-schedule-automation | */5 * * * *`.
- Without pg_cron, the app runs the same rules whenever staff or admins open 5ime (at most every
  3 minutes), so nothing breaks — check-outs just happen when someone next opens the app.
- Islamic public holidays are entered as *Expected*. When the Federal Government announces the date,
  confirm or move it in Global Admin → Holidays. Add any extra day the government declares there too.
- Privacy: only the time and the kind of place (office / home / approved place) are kept for
  automation, never coordinates, and they are deleted after 90 days.

