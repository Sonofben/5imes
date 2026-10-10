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
2. **Run the schema.** Open **SQL Editor** and run these four files **in order**, one at a time, waiting for "Success" each time:
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_security_billing_attendance.sql`
   3. `supabase/migrations/0003_payment_history_attendance_corrections.sql`
   4. `supabase/migrations/0004_attendance_device_privacy.sql`

   Never run the files in `supabase/tests/` there. They are for throwaway test databases.
3. **Copy the keys.** In **Project Settings → API**, copy:
   - `Project URL`
   - the `anon public` key
   - the `service_role` key
4. **Set the auth URLs.** In **Authentication → URL Configuration**:
   - **Site URL:** `https://<ip-with-dashes>.sslip.io`. Example: IP `203.0.113.5` becomes `203-0-113-5.sslip.io`.
   - **Redirect URLs:** add `https://<ip-with-dashes>.sslip.io/auth/callback`
5. **Email sign-in** stays enabled.
   - The built-in mailer only sends a few emails per hour, which is enough for the demo.
   - Before real staff onboard, set custom SMTP under **Authentication → Emails → SMTP Settings**.

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

## Everyday operations

| Task | Command (in `/opt/apps/5ime`) |
|---|---|
| Deploy an update | `git pull && docker compose up -d --build` |
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

## Troubleshooting

| Symptom | Fix |
|---|---|
| `docker compose ps` not healthy | Run `docker compose logs --tail=100`. Usually a typo in `.env`. |
| "Location permission is blocked" | Use the **https** address. In the phone's browser settings, allow Location for the site. |
| Magic link → "Sign-in failed" | Supabase **Redirect URLs** must include `https://<host>/auth/callback`, and `NEXT_PUBLIC_SITE_URL` must match exactly. Rebuild after changing it. |
| Emails not arriving | Built-in Supabase mailer limit hit. Add custom SMTP. |
| Check-ins always "Outside approved locations" | Re-pin the office from inside the building, or raise its radius (Pro). |
| `nginx -t` fails after adding 5ime | Run `sudo rm /etc/nginx/sites-enabled/5ime && sudo nginx -t`. This puts Nginx back exactly as it was for CACTS. |
