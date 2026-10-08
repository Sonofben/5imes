# Deploying 5ime on Contabo (no Docker)

**Architecture:**
- **App:** Next.js runs on your Contabo VPS under PM2.
- **Web server:** Nginx in front, with free HTTPS from Let's Encrypt.
- **Database and sign-in:** hosted Supabase.
- **Payments:** Paystack, routed to the Kora Forge subaccount.

HTTPS is required: phones block GPS on plain `http://` sites, so check-in won't work without it.

**Time needed:** about 60–90 minutes the first time.

---

## 1. Supabase (≈15 min)

1. **Create the project.** Go to <https://supabase.com>, create a new project, and pick the region closest to Nigeria that's offered. Save the database password somewhere safe.
2. **Run the schema.** Open **SQL Editor**, paste in all of `supabase/migrations/0001_init.sql` and click **Run**. It should finish with "Success".
3. **Copy the keys.** In **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never share it)
4. **Set the auth URLs.** In **Authentication → URL Configuration**:
   - **Site URL:** `https://YOUR-HOST` (for example `https://203-0-113-5.sslip.io`)
   - **Redirect URLs:** add `https://YOUR-HOST/auth/callback`
5. **Email sign-in** (**Authentication → Providers → Email**):
   - Keep it enabled.
   - Supabase's built-in mailer only sends a few emails per hour, which is fine for the demo. Before real clients come on, go to **Authentication → Emails → SMTP Settings** and add a proper SMTP sender (for example `no-reply@5ime.ng`).

## 2. Microsoft & Google sign-in (≈20 min, can be done after the demo)

Both providers send people back to the same Supabase callback URL:
`https://<your-project-ref>.supabase.co/auth/v1/callback`

**Microsoft (Entra ID / Microsoft 365)**
1. In <https://portal.azure.com>, go to **App registrations → New registration**.
2. Under **Supported account types**, choose *Accounts in any organizational directory* (multi-tenant).
3. Set the **Redirect URI** (Web) to the Supabase callback above.
4. Under **Certificates & secrets**, create a **New client secret** and copy its *Value*.
5. In Supabase, go to **Auth → Providers → Azure**:
   - Enable it.
   - Paste the Application (client) ID and the secret.
   - Leave the Tenant URL empty (it defaults to *common*).

**Google Workspace**
1. In <https://console.cloud.google.com>, go to **APIs & Services → OAuth consent screen**:
   - Set it to External.
   - Use app name 5ime.
   - Add your domain once you have one.
2. Go to **Credentials → Create credentials → OAuth client ID → Web application**:
   - Add the Supabase callback as an authorised redirect URI.
3. In Supabase, go to **Auth → Providers → Google**, enable it and paste the Client ID and secret.

Personal Gmail, Yahoo, Outlook.com and similar accounts are rejected by the app itself, whichever way someone signs in.

## 3. The server (≈20 min)

SSH into the Contabo VPS as a sudo user.

**Port check if this is the same VPS as the mail server.** Stalwart may already be using ports 80/443. Check first:
```bash
sudo ss -ltnp | grep -E ':80 |:443 '
```
If Stalwart owns those ports, use a different VPS, or move Stalwart's web admin to another port.

```bash
# Node 22 + build tools
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx certbot python3-certbot-nginx
sudo npm i -g pm2

# Get the code (from GitHub, or upload the zip and unzip it)
sudo mkdir -p /var/www && sudo chown $USER /var/www && cd /var/www
git clone git@github.com:<you>/5ime.git && cd 5ime      # or: unzip 5ime.zip && cd 5ime

# Environment
cp .env.example .env.local
nano .env.local        # fill in the values from steps 1 and 5

# Build & run
npm ci
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup             # run the command it prints, so 5ime restarts on reboot
```

The app now listens on `127.0.0.1:3005`.

## 4. Address + HTTPS (≈10 min)

**Demo address with no domain.** sslip.io turns your server IP into a hostname for free.
- Example: IP `203.0.113.5` becomes `203-0-113-5.sslip.io`.
- Set `NEXT_PUBLIC_SITE_URL=https://203-0-113-5.sslip.io` in `.env.local`, then rebuild with `npm run build && pm2 reload 5ime`.

**Real domain later.** In Cloudflare or your registrar's DNS, add:
- `A` record: `@` → VPS IP
- `A` record: `www` → VPS IP

Then use the domain instead of the sslip host everywhere below.

```bash
sudo cp deploy/nginx-5ime.conf /etc/nginx/sites-available/5ime
sudo sed -i 's/SERVER_NAME/203-0-113-5.sslip.io/' /etc/nginx/sites-available/5ime   # your host
sudo ln -s /etc/nginx/sites-available/5ime /etc/nginx/sites-enabled/5ime
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d 203-0-113-5.sslip.io --redirect -m you@yourcompany.com --agree-tos -n
sudo ufw allow 'Nginx Full'   # if ufw is on
```

Open `https://YOUR-HOST` and you should see the 5ime landing page.

**If you're using Cloudflare:** set SSL/TLS mode to **Full (strict)** after certbot succeeds, or turn the orange-cloud proxy off for the first certbot run.

## 5. Paystack (≈10 min)

1. In the Kora Forge Paystack dashboard, go to **Settings → API Keys**. Copy the **Secret key** into `PAYSTACK_SECRET_KEY`.
   - Use the test key for the demo.
   - Switch to the live key when you go live.
2. Go to **Subaccounts** and create (or open) the 5ime subaccount. Copy its code (`ACCT_…`) into `PAYSTACK_SUBACCOUNT`.
3. Go to **Settings → API Keys & Webhooks** and set the **Webhook URL** to `https://YOUR-HOST/api/paystack/webhook`.
4. Apply the changes: `npm run build && pm2 reload 5ime`.

**How billing works:**
- Each payment covers **30 days** for the current number of people: seats × ₦250 (Basic) or ₦500 (Pro).
- Each company gets a **14-day Pro trial**.
- When the trial or a paid period ends, staff can't check in until the admin pays. There's a 3-day grace period for paid plans.

If `PAYSTACK_SECRET_KEY` is empty, the billing page runs in demo mode.

## 6. Demo run-through for the client

1. **Admin sets up the company.** Sign in at `https://YOUR-HOST/login` with a **company email**. You'll be asked to name the company, which starts the 14-day trial.
2. **Add the office.** On **Locations**, stand in the office and tap **Use my current location**.
3. **Set the schedule.** On **Schedule**, choose office and home days. For example: Mon/Tue/Thu office, Wed/Fri home.
4. **Invite staff.** On **Staff**, invite a colleague with the same email domain.
5. **Staff signs in on a phone.** They open the link, sign in, and add 5ime to their home screen.
6. **Staff pins home.** At home, they tap **I'm at home — pin this location**. The admin approves it on **Staff**.
7. **Check in.** Staff tap **Check in**. The admin watches it appear on **Today**.
8. **Reports.** Show the **Reports** page and the CSV download.

## Updating

```bash
cd /var/www/5ime && git pull && npm ci && npm run build && pm2 reload 5ime
```

Database changes go in a new file in `supabase/migrations/`, run in the SQL Editor.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Location permission is blocked" | Site must be on **https**. In the phone's browser settings, allow Location for the site. |
| Magic link opens "Sign-in failed" | Check Supabase **Redirect URLs** includes `https://YOUR-HOST/auth/callback` and `NEXT_PUBLIC_SITE_URL` matches exactly. |
| Emails not arriving | Built-in Supabase mailer limit hit. Add custom SMTP (step 1.5). |
| Microsoft login error "AADSTS50011" | The redirect URI in Azure must be the **Supabase** callback, not the 5ime one. |
| Check-ins always "Outside approved locations" | The office pin is off. Re-pin from inside the building, or raise the radius (Pro). |
| `pm2 logs 5ime` | Shows app errors. |
