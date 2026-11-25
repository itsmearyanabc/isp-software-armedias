# Armedias ISP Software — Setup & Go-Live Guide

## What you have (4 files)

| File | Put it in Apps Script as | What it is |
|---|---|---|
| `Code.gs` | Script file **Code** | Client app backend (billing, customers, staff, …) |
| `Master.gs` | Script file **Master** | Your Master Console backend (clients, logins, stats) |
| `index.html` | HTML file **index** | The app your clients use |
| `master.html` | HTML file **master** | Your Master Console screen |

Also included:

- `domain-hosting/` – three files to upload to your own website (see step 7).
- `armedias-logo.png` – your logo, already built into both apps.

The file names must be exactly `Code`, `Master`, `index` and `master` (Apps Script adds `.gs` / `.html` itself).

---

## 1. Put the code into your spreadsheet

1. Open your copied Google Sheet (the one you bought).
2. Click **Extensions → Apps Script**.
3. In the left panel you will see `Code.gs` (and maybe `index.html`):
   - Open **Code.gs**, select everything (Ctrl/Cmd + A), delete it, then paste the full contents of the new `Code.gs`.
   - Open **index.html**, select everything, delete it, then paste the new `index.html`.
4. Click the **＋** next to "Files" → **Script** → name it `Master` → paste `Master.gs`.
5. Click **＋** → **HTML** → name it `master` → paste `master.html`.
6. Click the 💾 **Save** icon.

> Delete any other old files the seller included (for example an old `master` or `setup` file) so that only these 4 files remain.

## 2. Set the time zone

In Apps Script, click ⚙️ **Project Settings**, then set **Time zone** to `(GMT+05:00) Karachi`, or your own zone.

## 3. Give permissions (one time)

1. In the editor, pick the function **`upgradeAllTenants`** from the dropdown at the top and click **Run**.
2. Google asks for permission. Click **Review permissions**, choose your account, then **Advanced → Go to (project) (unsafe) → Allow**.
   It says "unsafe" only because the app is your own and not verified by Google. This is normal.
3. With no clients yet, it simply finishes. That's fine: the goal was just to grant the permissions.

## 4. Deploy it live (make the web link)

1. Click **Deploy → New deployment**.
2. Click the ⚙️ next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** `Armedias ISP v1`
   - **Execute as:** **Me** (your Google account) ← important
   - **Who has access:** **Anyone** ← important (your clients don't need Google accounts)
4. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

You now have two links:

- **Client login link:** `https://script.google.com/macros/s/XXXX/exec`
- **Your Master Console:** the same link plus `?master`, for example `https://script.google.com/macros/s/XXXX/exec?master`

Bookmark the Master Console link and keep it private.

## 5. First login to the Master Console

1. Open the `?master` link.
2. Log in with:
   - **Username:** `master`
   - **Password:** `Armedias@123`
3. You'll be asked to set your own password right away. Choose a strong one, at least 8 characters.

## 6. Create your first client

1. In the Master Console, click **New client**.
2. Fill in:
   - **Company ID:** a short code such as `FASTNET`. The client types this when they log in. It can't be changed later.
   - **Company name, owner, phone, plan, monthly fee, subscription length.**
   - **Limits:** max customers and max staff logins. Use `0` for unlimited.
   - **Owner login:** username and password. A random password is filled in for you.
   - Tick **Load demo data** if you want to show the client a trial with sample data.
3. Click **Create client** and wait up to a minute while their own spreadsheet is built.
4. A box shows the **login details**. Click **Copy** or **Send on WhatsApp** to give them to your client.

The client opens the client login link and enters **Company ID + Username + Password**. Their owner account is a **Super Admin**, so they can add their own staff (admin, accountant, collector) under *Staff / Users*.

Each client's data is stored in its own spreadsheet, inside a Drive folder named **"Armedias ISP — Client Databases"**.

## 7. Use your own domain (e.g. isp.armedias.com)

Google doesn't let you attach your own domain directly to an Apps Script link. Instead, you host two tiny pages on your domain that show the app full-screen. Clients only ever see your domain in the address bar.

**What you get:**

| Address | Opens |
|---|---|
| `https://isp.armedias.com` | Client **login + sign-up** page |
| `https://isp.armedias.com/admin` | **Your Master Console** (super admin) |

**Steps:**

1. Create the subdomain (e.g. `isp`) in your hosting panel (cPanel, Hostinger, Namecheap, …). Any normal web hosting works, because these are plain HTML files.
2. Open `domain-hosting/config.js` and replace `PASTE_YOUR_WEB_APP_URL_HERE` with your `/exec` link.
3. You only change this one file. The `/admin` page adds `?master` by itself.
4. Upload the **contents** of `domain-hosting/` to the subdomain's folder (usually `public_html/isp`), keeping this layout:
   ```
   index.html
   config.js
   logo.png
   admin/index.html
   ```
5. In Apps Script, open `Master.gs` and set `var PUBLIC_LOGIN_URL = 'https://isp.armedias.com';`. Save, then deploy a **New version** (step 9).
   From then on, login details you copy or WhatsApp to clients, and approval emails, show your domain instead of the Google link.

Prefer `admin.armedias.com` instead of `/admin`? Create a second subdomain `admin` and upload `admin/index.html` (renamed to `index.html`) plus `logo.png` into it.

### Option A — Cloudflare Pages + GitHub (free, auto-deploys on every push) ⭐

The repo contains everything, but Cloudflare publishes **only** the `domain-hosting` folder. Your Apps Script code is never put on your website.

1. Edit `domain-hosting/config.js` and paste your `/exec` link. This is the only file to change.
2. Commit and push to GitHub (`git add -A && git commit -m "set app url" && git push`).
3. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**. Authorise GitHub and pick the repo.
4. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `domain-hosting`
5. **Save and Deploy.** You get `<project>.pages.dev`.
6. Project → **Custom domains → Set up a custom domain** → `isp.armedias.com`.

From now on, every `git push` to `main` updates the site automatically. Keep the GitHub repo **private**, because it is the software you sell.

### Option A2 — Cloudflare Pages (drag & drop, no Git)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Upload assets**.
2. Name the project (e.g. `armedias-isp`) and upload the `domain-hosting` folder, after pasting your `/exec` link into `config.js`.
3. **Deploy.** You get `armedias-isp.pages.dev`.
4. **Custom domains → Set up a custom domain** → enter `isp.armedias.com`. If your domain is already on Cloudflare, the DNS record is added automatically.
5. Done: `isp.armedias.com` shows the client login and `isp.armedias.com/admin` shows your Master Console.

### Option B — your VPS (nginx)

1. Copy the files to the server, e.g. `/var/www/armedias-isp/` (`index.html`, `config.js`, `logo.png`, `admin/index.html`).
2. Add an nginx site:
   ```
   server {
     server_name isp.armedias.com;
     root /var/www/armedias-isp;
     index index.html;
     location / { try_files $uri $uri/ /index.html; }
   }
   ```
3. Point the DNS **A record** for `isp` to your VPS IP, run `sudo nginx -t && sudo systemctl reload nginx`, then add free HTTPS with `sudo certbot --nginx -d isp.armedias.com`.

**Cost:** these are 3 static files, so the hosting is essentially free. All the data and logic stay in Google Apps Script and Google Sheets on your Google account, with no database bill.

**Note:** on iPhone (Safari), the "stay logged in" memory inside an embedded page may reset when the browser is closed, so clients may simply need to log in again. Everything else works the same.

## 8. Client sign-ups (approval by you)

1. On the login page, a new ISP clicks **Sign up your ISP**. They fill in company name, Company ID, name, phone, email, city, username and password.
2. You get an **email** and the client appears in the Master Console as **Pending approval**. Click the **Pending sign-ups** counter to filter.
3. Click **Approve** and choose plan, fee, months, limits and demo data. Their database is created and they can log in immediately with the username and password they chose. If they gave an email, they get an approval email.
4. Or click ✖ to **reject**.

Until you approve, anyone trying to log in with that Company ID sees: *"Your account is waiting for approval by Armedias."*

## 9. Day-to-day in the Master Console

| You want to… | Do this |
|---|---|
| See all clients, their customers, collections, last login | **Clients** tab (click **Refresh stats** for the latest numbers) |
| See a client's staff and recent activity | 👁 **Details** |
| Reset a client's password | 👁 Details → 🔑 next to the user |
| Block a client (non-payment) | ⏸ **Suspend**. Their staff are logged out and can't log in. ▶ to re-activate |
| Renew a subscription | 📅 **Extend** (1 / 3 / 6 / 12 months) |
| Change plan, fee, limits, expiry | ✏️ **Edit** |
| Remove a client | 👁 Details → **Remove client**. Their spreadsheet is kept in your Drive |
| See what you did | **Activity** tab |

When a subscription expires, the client is blocked automatically. During the last 7 days, they see a "subscription expires in X days" warning.

## 10. Updating the code later

Whenever you change any file:

1. Paste the new code and **Save**.
2. Go to **Deploy → Manage deployments**. (Don't create a *New deployment*, because that would change your link.)
3. Click ✏️ **Edit** on your deployment, set **Version** to **New version**, then click **Deploy**.

The link stays the same, so clients don't need a new one. If an update adds new columns, run **`upgradeAllTenants`** once from the editor.

### Faster updates from this Mac (clasp is already set up)

From the project folder, run:
```
export PATH=$HOME/.local/node/bin:$PATH
clasp push --force
clasp deploy -i AKfycbyaMbrRbhLf7HZ_nQfo0UGQWSo7_oNPnX1hcIwnEY6YmC2hnfEdHvI_K-TnbJJDNZWTWQ --description "update"
```
This updates the **same** live link. Don't run `clasp deploy` without `-i`, because that would create a second link.

## 11. Forgot your master password?

In the Apps Script editor, choose **`resetMasterPassword`** and click **Run**. Your login goes back to `master` / `Armedias@123`, and you'll be asked to change it.

## Good to know

- Everything runs on your Google account, so it's free. Google's daily limits are generous for small and medium ISPs.
- Password-reset OTP emails are sent from your Gmail, up to about 100 per day on a free account.
- Don't rename or delete sheets inside a client's spreadsheet by hand.
- Never share the `?master` link or your master password with clients.

## Editing the app code (build step)

The app pages are edited in `src/index.html` and `src/master.html` (React/JSX).
Before deploying, they are pre-compiled into the root `index.html` / `master.html` so browsers don't
have to download a 3 MB compiler on every visit (much faster loading). Never edit the root HTML files by hand.

```
./build.sh
export PATH=$HOME/.local/node/bin:$PATH
clasp push --force
clasp deploy -i AKfycbyaMbrRbhLf7HZ_nQfo0UGQWSo7_oNPnX1hcIwnEY6YmC2hnfEdHvI_K-TnbJJDNZWTWQ --description "update"
git add -A && git commit -m "update" && git push
```

## Website pages (crm.armedias.com)
The public site is generated: edit text, prices and features in `tools/build_site.py`, then run
`python3 tools/build_site.py` and push to GitHub (Cloudflare publishes automatically).
New pages must also be added to the allow-list in `_worker.js`.
Trial length / auto-trial and plan limits live at the top of `Master.gs` (`AUTO_TRIAL`, `TRIAL_DAYS`, `PLAN_LIMITS`).
