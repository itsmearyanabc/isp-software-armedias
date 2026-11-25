# AR Medias CRM — SaaS roadmap

Where things stand and what to do next to sell **crm.armedias.com** as a proper paid SaaS.

## Live today
- **Sales site:** `crm.armedias.com`, with features, industries, pricing (6-month plans) and FAQ. **Sign in** and **Sign up** are at the top right.
- **App:** `crm.armedias.com/app`. Sign-up waits for your approval, and each business gets its own database.
- **Master Console:** `crm.armedias.com/admin`. Clients, plans, expiry, limits, suspend/extend and stats.
- **Billing inside the app:** invoices with GST, live billing, payments, recovery, WhatsApp (official API) and email bills.
- **Integrations:** API keys for Zapier, Make and n8n.

## Phase 1 — Start selling (next 2–4 weeks)
1. **Confirm the prices.** They're in `domain-hosting/index.html` → `PLANS` (₹2,999 / ₹5,999 / ₹11,999 per 6 months). The plan limits should match what you set in the Master Console (max customers and max staff).
2. **Add legal pages:** Terms of Service, Privacy Policy and a Refund/Cancellation policy. These are **required by payment gateways** (Razorpay, Cashfree) and build trust. Have them written or reviewed by a lawyer or CA.
3. **Add a contact block:** WhatsApp button, email and phone on the sales site.
4. **Set a trial length.** For example 14 days: when approving a sign-up, choose "1 month" or edit the expiry date.
5. **Accept payments manually first:** UPI or bank transfer, then click **Extend** in the Master Console. This needs no code.

## Phase 2 — Automate payments
1. **Razorpay Subscriptions** (or Cashfree): a 6-month plan per tier, paid by card, UPI AutoPay or netbanking.
2. A **"Billing" page inside the client app:** current plan, expiry date, **Pay / Renew / Upgrade** button, and past receipts.
3. A **payment webhook:** when a payment succeeds, the client's expiry date is extended and the plan limits are set automatically.
4. **GST invoices for your own subscriptions:** emailed automatically to each client.
5. **Automatic reminders:** 7, 3 and 1 days before expiry by email/WhatsApp, and a grace period before suspending.

## Phase 3 — Grow and retain
- **Onboarding:** a welcome checklist, plus import of customers and products from Excel/CSV.
- **Help centre:** short videos and how-to articles, plus an in-app WhatsApp support button.
- **Referral programme:** for example, one month free for each referred business.
- **SEO:** a blog and industry pages ("CRM for ISPs", "Billing software for clothing shops") on the sales site.
- **Analytics:** Google Analytics/Plausible on the sales site, and sign-up → paid conversion tracked in the Master Console.

## Scaling — important limits to plan for
The app runs on **Google Apps Script** with your Google account. That keeps it free, but Google sets limits:

| Limit (free Gmail account) | Approx. | With Google Workspace |
|---|---|---|
| Emails sent per day (OTP + bills) | 100 | 1,500 |
| Script run time per request | 6 min | 6 min |
| Requests handled at the same time | ~30 | ~30 |
| External calls (WhatsApp API) per day | 20,000 | 100,000 |

**Recommendations:**
1. **Move the project to a Google Workspace account** before you pass about 20 paying clients. That gives higher email and API limits and a professional sender address (billing@armedias.com).
2. Expect a few seconds of "cold start" when the app hasn't been used for a while. That's normal for Apps Script.
3. **Beyond roughly 100 active businesses**, or if clients need very large data (100k+ records each), plan a migration to a dedicated backend (Node.js/PostgreSQL on your VPS or Cloud Run). The current design (one database per client, an API layer and role checks) maps directly onto that.

## Security checklist
- [ ] GitHub repo set to **private**.
- [ ] 2-Step Verification on the Google account that owns the app.
- [ ] Master Console password changed from the default.
- [ ] Hash client staff passwords (they are currently stored in plain text in each client's sheet, which only you can access). Recommended before scaling.
- [ ] Weekly backup: Google Drive → download the "Armedias ISP — Client Databases" folder, or use Google Takeout.
