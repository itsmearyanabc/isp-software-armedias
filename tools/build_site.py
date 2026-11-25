#!/usr/bin/env python3
"""AR Medias CRM — builds the public website (crm.armedias.com) into domain-hosting/.
Edit text / prices here, then run:  python3 tools/build_site.py
Pages share one header, footer and stylesheet (domain-hosting/site.css)."""
import json, os, html

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'domain-hosting')
SITE = 'https://crm.armedias.com'
MAIN = 'https://armedias.com'
CONTACT = 'https://armedias.com/#contact'
TRIAL_DAYS = 3

# ===== Pricing (₹ per month list price) — billed every 6, 12 or 24 months only =====
PLANS = {
    'small': {'name': 'Small Business', 'month': 299, 'for': 'For shops, small teams and growing businesses',
              'items': ['1 business, up to 3 staff logins', 'Up to 1,000 customers', 'Invoices with GST calculator & live billing',
                        'Payments, receipts & recovery board', 'WhatsApp & email bills (free click-to-chat)', 'Leads, complaints & reports', 'Email support']},
    'enterprise': {'name': 'Enterprise', 'month': 1200, 'for': 'For larger teams, multiple branches & custom needs',
                   'items': ['Everything in Small Business', 'Unlimited staff logins', 'Unlimited customers', 'Official WhatsApp Business API bills',
                             'API keys & integrations (Zapier, Make, n8n)', 'Priority support & onboarding help', 'Custom features on request']},
}
TERMS = [(6, 20), (12, 30), (24, 35)]          # (months, % discount)
DEFAULT_TERM = 12


def price(plan, months, disc):
    full = PLANS[plan]['month'] * months
    return full, round(full * (100 - disc) / 100)


def inr(n):
    s = str(int(n)); last3 = s[-3:]; rest = s[:-3]
    parts = []
    while len(rest) > 2:
        parts.insert(0, rest[-2:]); rest = rest[:-2]
    if rest: parts.insert(0, rest)
    return '₹' + (','.join(parts + [last3]) if parts else last3)


NAV = [('/features', 'Features & guide'), ('/#industries', 'Industries'), ('/pricing', 'Pricing'), ('/enterprise', 'Enterprise'), ('/#faq', 'FAQ')]


def layout(path, title, desc, body, jsonld=None, noindex=False):
    links = ''.join('<a href="%s"%s>%s</a>' % (h, ' class="on"' if h == path else '', t) for h, t in NAV)
    ld = ''
    for obj in (jsonld or []):
        ld += '<script type="application/ld+json">%s</script>\n' % json.dumps(obj, ensure_ascii=False)
    canon = SITE + (path if path != '/' else '/')
    return f"""<!DOCTYPE html>
<html lang="en-IN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{html.escape(title)}</title>
  <meta name="description" content="{html.escape(desc)}">
  <link rel="canonical" href="{canon}">
  {'<meta name="robots" content="noindex">' if noindex else ''}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="AR Medias CRM">
  <meta property="og:title" content="{html.escape(title)}">
  <meta property="og:description" content="{html.escape(desc)}">
  <meta property="og:url" content="{canon}">
  <meta property="og:image" content="{SITE}/logo.png">
  <meta name="theme-color" content="#3B1F73">
  <link rel="icon" type="image/png" href="/logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link rel="stylesheet" href="/site.css">
  {ld}
</head>
<body>
  <nav class="nav"><div class="wrap">
    <button class="menu-btn" aria-label="Menu" onclick="document.getElementById('links').classList.toggle('open')"><i class="fas fa-bars"></i></button>
    <a class="brand" href="/"><img src="/logo.png" alt="AR Medias"><span>AR MEDIAS<small>CRM</small></span></a>
    <div class="nav-links" id="links">{links}</div>
    <div class="nav-cta">
      <a class="btn btn-ghost signin" href="/app"><i class="fas fa-right-to-bracket"></i> Sign in</a>
      <a class="btn btn-orange" href="/app?signup">Sign up</a>
    </div>
  </div></nav>
{body}
  <footer><div class="wrap">
    <div class="cols">
      <div><a class="brand" href="/" style="margin-bottom:10px"><img src="/logo.png" alt=""><span>AR MEDIAS<small>CRM</small></span></a>
        <p style="max-width:380px">AR Medias CRM is built by <a href="{MAIN}" style="display:inline;color:#fff;font-weight:700">AR Medias</a> — software, apps, CRM/ERP and AI automation for growing businesses. New Delhi, India.</p></div>
      <div><h4>Product</h4><a href="/features">Features &amp; guide</a><a href="/pricing">Pricing</a><a href="/enterprise">Enterprise</a><a href="/app">Sign in</a><a href="/app?signup">Start free trial</a></div>
      <div><h4>Solutions</h4><a href="/crm-for-isp">CRM for ISPs</a><a href="/billing-software-for-shops">Billing software for shops</a><a href="/crm-for-agencies">CRM for agencies</a>
        <h4 style="margin-top:14px">AR Medias</h4><a href="{MAIN}">armedias.com</a><a href="{CONTACT}">Contact us</a></div>
    </div>
    <div class="copy"><span>© <span class="yr"></span> AR Medias. All rights reserved.</span><span>CRM by <a href="{MAIN}" style="display:inline">AR Medias</a></span></div>
  </div></footer>
  <script>
    document.querySelectorAll('.yr').forEach(function (e) {{ e.textContent = new Date().getFullYear(); }});
    document.querySelectorAll('.nav-links a').forEach(function (a) {{ a.addEventListener('click', function () {{ document.getElementById('links').classList.remove('open'); }}); }});
    // pricing switch (6 / 12 / 24 months)
    document.querySelectorAll('[data-term]').forEach(function (b) {{ b.addEventListener('click', function () {{
      var m = b.getAttribute('data-term');
      document.querySelectorAll('[data-term]').forEach(function (x) {{ x.classList.toggle('on', x.getAttribute('data-term') === m); }});
      document.querySelectorAll('[data-show]').forEach(function (x) {{ x.style.display = x.getAttribute('data-show') === m ? '' : 'none'; }});
    }}); }});
  </script>
</body>
</html>
"""


def write(path, content):
    folder = ROOT if path == '/' else os.path.join(ROOT, path.strip('/'))
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(content)
    print('built', path)


def pricing_block(compact=False):
    sw = ''.join('<button data-term="%d" class="%s">%d months<small>−%d%%</small></button>' % (m, 'on' if m == DEFAULT_TERM else '', m, d) for m, d in TERMS)
    cards = ''
    for key in ('small', 'enterprise'):
        p = PLANS[key]; hot = key == 'small'
        prices = ''
        for m, d in TERMS:
            full, now = price(key, m, d)
            prices += (f'<div data-show="{m}" style="{"" if m == DEFAULT_TERM else "display:none"}">'
                       f'<div class="amount">{inr(now)} <small>/ {m} months</small></div>'
                       f'<div class="permo">≈ {inr(round(now / m))} per month <span class="strike">{inr(full)}</span></div>'
                       f'<div class="save">You save {inr(full - now)} ({d}% off)</div></div>')
        items = ''.join('<li><i class="fas fa-check"></i><span>%s</span></li>' % i for i in p['items'])
        extra = (f'<a class="btn btn-line" style="margin-top:10px" href="{CONTACT}" target="_blank" rel="noopener">Need something custom? Talk to us</a>' if key == 'enterprise' else '')
        cards += (f'<div class="plan{" hot" if hot else ""}">{"<span class=tag>Most popular</span>" if hot else ""}'
                  f'<h3>{p["name"]}</h3><div class="for">{p["for"]}</div>'
                  f'<div style="color:var(--muted);font-size:14px;margin-bottom:6px">List price {inr(p["month"])}/month</div>{prices}'
                  f'<ul>{items}</ul><a class="btn {"btn-orange" if hot else "btn-navy"}" href="/app?signup">Start {TRIAL_DAYS}-day free trial</a>{extra}</div>')
    return (f'<div class="center"><div class="switch" role="group" aria-label="Billing period">{sw}</div></div>'
            f'<div class="grid g2" style="max-width:900px;margin:0 auto">{cards}</div>'
            f'<p class="price-note">Prices in INR, GST extra · Billed every 6, 12 or 24 months · {TRIAL_DAYS}-day free trial with every plan · '
            f'Bigger or custom project? <a href="/enterprise" style="color:var(--orange);font-weight:700">See Enterprise</a></p>')


FEATURES = [
    ('fa-users', '', 'Customer 360', 'Every customer\'s details, bills, payments, complaints and full history on one screen.', 'customers'),
    ('fa-file-invoice', 'o', 'GST invoices & calculator', 'Discount and GST as amount or %, net and total worked out live. Monthly bills for everyone in one click.', 'invoices'),
    ('fa-cash-register', 'o', 'Live billing at the counter', 'Pick products, set quantity, take payment — the bill and receipt are created together.', 'live-billing'),
    ('fab fa-whatsapp', 'g', 'WhatsApp & email bills', 'Every bill and receipt gets a private link. Send it on WhatsApp in one tap, or by email.', 'whatsapp'),
    ('fa-hand-holding-dollar', '', 'Recovery board', 'See who owes what and for how long, send reminders and print collection sheets.', 'recovery'),
    ('fa-user-plus', '', 'Leads & follow-ups', 'Track enquiries from first call to won, with follow-up dates and one-click convert.', 'leads'),
    ('fa-user-shield', 'g', 'Staff roles & permissions', 'Owner, admin, accountant, collector — decide who can view, add, edit or delete.', 'staff'),
    ('fa-chart-pie', 'o', 'Reports', 'Monthly and yearly billed vs collected, expenses, profit and branch-wise performance.', 'reports'),
    ('fa-plug', '', 'API & integrations', 'Send website and ad leads straight into your CRM — works with Zapier, Make and n8n.', 'api'),
]


def feature_cards():
    out = ''
    for ic, cls, t, d, anchor in FEATURES:
        icon = ic if ic.startswith('fab') else 'fas ' + ic
        out += f'<a class="card" href="/features#{anchor}"><div class="ic {cls}"><i class="{icon}"></i></div><h3>{t}</h3><p>{d}</p></a>'
    return out


FAQ = [
    ('Is there a free trial?', f'Yes — every new business gets a {TRIAL_DAYS}-day free trial with all features, starting the moment you sign up. No card and no approval needed. You can add sample data to explore straight away.'),
    ('What happens when the trial ends?', 'Your account locks and you choose a plan — Small Business or Enterprise. Your data stays safe; everything is exactly as you left it once you subscribe.'),
    ('How does billing work?', 'Plans are billed every 6, 12 or 24 months. The longer you choose, the more you save: 20%, 30% or 35% off the monthly price. GST is extra.'),
    ('Can my staff use it on their phones?', 'Yes — it works in any browser on mobile, tablet or computer. Each staff member gets their own login with the permissions you choose.'),
    ('Can I send bills on WhatsApp?', 'Yes. Every bill and receipt has a private link that opens WhatsApp with the message ready. Enterprise can also connect the official WhatsApp Business API to send PDF bills automatically.'),
    ('Is my data safe?', 'Each business has its own separate database, staff passwords are encrypted, every action is checked against your permissions and recorded in the activity log. You can even keep your data in your own Google Drive.'),
    ('Do you build custom features?', f'Yes — that is what our Enterprise plan is for. AR Medias builds custom CRM, ERP, apps and automation. <a href="/enterprise" style="color:var(--orange);font-weight:700">See Enterprise</a> or <a href="{CONTACT}" style="color:var(--orange);font-weight:700">contact us</a>.'),
]


def faq_html(items):
    return ''.join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q, a in items)


def org_ld():
    return {'@context': 'https://schema.org', '@type': 'Organization', 'name': 'AR Medias', 'url': MAIN, 'logo': SITE + '/logo.png',
            'sameAs': [MAIN], 'address': {'@type': 'PostalAddress', 'addressLocality': 'New Delhi', 'addressCountry': 'IN'}}


def app_ld():
    offers = []
    for key in ('small', 'enterprise'):
        for m, d in TERMS:
            offers.append({'@type': 'Offer', 'name': '%s — %d months' % (PLANS[key]['name'], m), 'price': str(price(key, m, d)[1]), 'priceCurrency': 'INR'})
    return {'@context': 'https://schema.org', '@type': 'SoftwareApplication', 'name': 'AR Medias CRM', 'applicationCategory': 'BusinessApplication',
            'operatingSystem': 'Web, Android, iOS', 'url': SITE, 'publisher': {'@type': 'Organization', 'name': 'AR Medias', 'url': MAIN},
            'offers': offers, 'description': 'CRM and billing software for Indian businesses: customers, GST invoices, payments, recovery and WhatsApp bills.'}


def faq_ld(items):
    import re
    return {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': re.sub('<[^>]+>', '', a)}} for q, a in items]}


CTA = f"""  <section style="padding-top:20px"><div class="wrap"><div class="cta-band">
    <div><h2>Ready to get paid faster?</h2><p>Start your {TRIAL_DAYS}-day free trial — no card, no approval.</p></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-orange" href="/app?signup">Start free trial <i class="fas fa-arrow-right"></i></a><a class="btn btn-ghost" href="{CONTACT}" target="_blank" rel="noopener">Talk to AR Medias</a></div>
  </div></div></section>"""


def read_part(name):
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site', name), encoding='utf-8') as f:
        return f.read()


def build_home():
    body = read_part('home_hero.html') + f"""
  <section id="features"><div class="wrap">
    <div class="head center"><div class="kicker">Features</div><h2>Everything you need to run and get paid.</h2>
      <p class="sub">One simple system for your customers, money and team — no spreadsheets, no lost bills, no forgotten dues.</p></div>
    <div class="grid g3">{feature_cards()}</div>
    <div class="center"><a class="more-link" href="/features">See every feature &amp; how to use it <i class="fas fa-arrow-right"></i></a></div>
  </div></section>

  <section id="industries" class="soft"><div class="wrap">
    <div class="head"><div class="kicker">Industries</div><h2>Set up for the way your business works.</h2><p class="sub">Choose your business type and the CRM adapts its menus, fields and words to you.</p></div>
    <div class="grid g4">
      <a class="ind" href="/crm-for-isp"><i class="fas fa-wifi"></i><h3>Internet &amp; cable</h3><ul><li>Packages &amp; speeds</li><li>Area-wise recovery</li><li>Field collection runs</li><li>Equipment tracking</li></ul></a>
      <a class="ind" href="/billing-software-for-shops"><i class="fas fa-shirt"></i><h3>Shops &amp; retail</h3><ul><li>Products &amp; branches</li><li>Counter billing with GST</li><li>Credit (udhaar) tracking</li><li>WhatsApp bills</li></ul></a>
      <a class="ind" href="/crm-for-agencies"><i class="fas fa-bullhorn"></i><h3>Agencies</h3><ul><li>Clients &amp; services</li><li>Monthly retainers</li><li>Support tickets</li><li>Lead pipeline</li></ul></a>
      <div class="ind"><i class="fas fa-briefcase"></i><h3>Any business</h3><ul><li>Products &amp; services</li><li>Invoices &amp; payments</li><li>Expenses &amp; vendors</li><li>Profit reports</li></ul></div>
    </div>
  </div></section>

  <section id="how"><div class="wrap">
    <div class="head center"><div class="kicker">How it works</div><h2>Up and running in minutes.</h2></div>
    <div class="grid g3 steps">
      <div class="step"><h3>Sign up free</h3><p>Register your business and choose your type. Your account is ready instantly — {TRIAL_DAYS} days free.</p></div>
      <div class="step"><h3>Add your data</h3><p>Add customers and products (or start with sample data), invite your staff and set what each can do.</p></div>
      <div class="step"><h3>Bill &amp; get paid</h3><p>Create GST bills, record payments and send bills on WhatsApp. Pick a plan when you're ready.</p></div>
    </div>
    <div class="center"><a class="more-link" href="/features">Read the full how-to guide <i class="fas fa-arrow-right"></i></a></div>
  </div></section>

  <section id="pricing" class="soft"><div class="wrap">
    <div class="head center"><div class="kicker">Pricing</div><h2>Two simple plans. Save up to 35%.</h2><p class="sub">Billed every 6, 12 or 24 months. Every plan includes all updates and a {TRIAL_DAYS}-day free trial.</p></div>
    {pricing_block()}
    <div class="center"><a class="more-link" href="/pricing">Compare plans in detail <i class="fas fa-arrow-right"></i></a></div>
  </div></section>

  <section id="faq"><div class="wrap" style="max-width:820px">
    <div class="head center"><div class="kicker">FAQ</div><h2>Questions we hear often.</h2></div>
    <div class="faq">{faq_html(FAQ)}</div>
  </div></section>

  <section class="soft" style="padding:56px 0"><div class="wrap center">
    <div class="kicker">Built by AR Medias</div><h2 style="font-size:32px">Need a custom app, ERP or automation?</h2>
    <p class="sub" style="margin:0 auto 18px">AR Medias builds software, mobile apps, CRM/ERP systems and AI automation for businesses in India and abroad.</p>
    <a class="btn btn-navy" href="{MAIN}" target="_blank" rel="noopener">Visit armedias.com <i class="fas fa-arrow-up-right-from-square"></i></a>
  </div></section>
{CTA}"""
    write('/', layout('/', 'AR Medias CRM — CRM & GST billing software for Indian businesses',
                      f'Manage customers, GST invoices, live billing, payments, recovery and WhatsApp bills in one CRM. For ISPs, shops, agencies & every business. {TRIAL_DAYS}-day free trial.',
                      body, [org_ld(), app_ld(), faq_ld(FAQ)]))


def shot(title, inner):
    return f'<div class="shot-wrap"><div class="shot"><div class="shot-bar"><i></i><i></i><i></i>{title}</div>{inner}</div></div>'


GUIDE = [
    ('customers', 'Customers', 'Customer 360 — everyone in one place',
     'Add customers with just a name and phone. Everything else — address, plan, opening balance, ID, notes — is optional.',
     ['Open <b>Customers → Add</b>, enter name and phone, save.', 'Click the <b>eye</b> icon to see their full profile: bills, payments, complaints, documents and a timeline.',
      'Use the coloured status bar to filter active / inactive customers, and the WhatsApp or call buttons to reach them.'],
     'Old dues? Enter them as <b>Opening balance</b> when adding the customer — they flow into every report.',
     ['Search & filters', 'CSV / PDF export', 'Documents (ID, contracts)', 'Timeline'],
     shot('Customers', '<div class="shot-body"><table><tr><th>Code</th><th>Name</th><th>Phone</th><th>Balance</th><th>Status</th></tr>'
          '<tr><td>CUS-00012</td><td>Riya Fashions</td><td>98100 12345</td><td><span class="tg tag-ok">Clear</span></td><td><span class="tg tag-ok">Active</span></td></tr>'
          '<tr><td>CUS-00013</td><td>Aman Traders</td><td>98110 22334</td><td><span class="tg tag-due">₹1,180</span></td><td><span class="tg tag-ok">Active</span></td></tr>'
          '<tr><td>CUS-00014</td><td>Pixel Studio</td><td>99990 45678</td><td><span class="tg tag-bad">₹6,400</span></td><td><span class="tg tag-due">Inactive</span></td></tr></table></div>')),
    ('invoices', 'Billing', 'GST invoices with a live calculator',
     'Create a bill and watch the maths happen: amount, discount (₹ or %), net amount, GST (₹ or %) and total.',
     ['Open <b>Invoices → Add</b>. Today\'s date and the current month fill in automatically.', 'Pick the customer — their product and price fill in for you.',
      'Type the discount and GST as an amount or a percentage, e.g. <b>10%</b> and <b>18%</b>.', 'Save. You\'re asked whether to send the bill on WhatsApp or email.'],
     'Bill everyone at once: <b>Invoices → Run Billing</b> creates this month\'s bill for every active customer.',
     ['Monthly billing run', 'Print / PDF', 'Overdue tracking', 'Paid / partial / unpaid status'],
     shot('Add invoice', '<div class="shot-body"><div class="kv"><span>Amount</span><b>₹1,000</b></div><div class="kv"><span>− Discount (10%)</span><span>₹100</span></div>'
          '<div class="kv"><b>Net amount</b><b>₹900</b></div><div class="kv"><span>+ GST (18%)</span><span>₹162</span></div><div class="kv b"><span>Total</span><span>₹1,062</span></div></div>')),
    ('live-billing', 'Counter sales', 'Live billing while taking payment',
     'At the counter? Make the bill and record the payment in one go.',
     ['Open <b>Payments → Add</b> and click <b>Create bill</b> (top right).', 'Pick products (or type a new one), set quantity — the price fills in.',
      'Add discount / GST. <b>Amount received</b> follows the bill total; change it for part-payments.', 'Click <b>Save bill &amp; payment</b>, then send it on WhatsApp.'],
     'New items you type are saved to your product list automatically, ready for next time.',
     ['Multiple items', 'Part payments & credit', 'Cash / UPI / card / bank', 'Receipt numbers'],
     shot('Add payment · Create bill', '<div class="shot-body"><table><tr><th>Product</th><th>Qty</th><th>Price</th><th>Amount</th></tr>'
          '<tr><td>Lawn suit 3-pc</td><td>2</td><td>₹4,500</td><td>₹9,000</td></tr><tr><td>Stitching</td><td>1</td><td>₹1,200</td><td>₹1,200</td></tr></table>'
          '<div class="kv b" style="margin-top:8px"><span>Bill total (incl. GST)</span><span>₹10,710</span></div><span class="gold-btn">Save bill &amp; payment</span></div>')),
    ('whatsapp', 'Sharing', 'Send bills & receipts on WhatsApp in one tap',
     'Every bill and receipt gets a permanent private link. Customers open it to view, print or save the PDF.',
     ['After saving a bill, choose <b>WhatsApp</b> in the popup — or press the WhatsApp button on any payment.', 'WhatsApp opens with the message and link already written. Just press send.',
      'Prefer email? Choose <b>Email</b> to send the PDF bill to the customer\'s inbox.'],
     'Enterprise can connect the official WhatsApp Business API to send PDF bills automatically from your business number.',
     ['Private links', 'PDF download', 'Email bills', 'Official WhatsApp API'],
     shot('WhatsApp', '<div class="wa-bg"><div class="bubble">Dear Riya,<br><br>Your bill <b>INV-00231</b> for ₹10,710 is ready.<br>View / download your bill: <span style="color:#0a66c2">crm.armedias.com/b?…</span><br><br>Thank you for your business 🙏</div></div>')),
    ('recovery', 'Recovery', 'Collect dues faster',
     'The Recovery board lists everyone who owes you, worst first — with total due, previous dues and days overdue.',
     ['Open <b>Recovery Board</b>. Filter by area/branch or search a name.', 'Tap WhatsApp to send a polite reminder, or call directly.',
      'Record the payment right there. Print an A4 collection sheet for field staff.'],
     'The dashboard shows overdue bills and promised payments due today, so nothing slips.',
     ['Days overdue', 'A4 collection sheet', 'Area-wise balances', 'Reminders'],
     shot('Recovery board', '<div class="shot-body"><table><tr><th>Customer</th><th>Due</th><th>Overdue</th></tr>'
          '<tr><td>Pixel Studio</td><td><b>₹6,400</b></td><td><span class="tg tag-bad">42 days</span></td></tr>'
          '<tr><td>Aman Traders</td><td><b>₹1,180</b></td><td><span class="tg tag-due">9 days</span></td></tr>'
          '<tr><td>Sharma Store</td><td><b>₹850</b></td><td><span class="tg tag-due">3 days</span></td></tr></table></div>')),
    ('leads', 'Sales', 'Leads, follow-ups & conversion',
     'Track every enquiry from first contact to a paying customer.',
     ['Add a lead with name, phone and source (walk-in, call, website, referral…).', 'Move it through New → Contacted → Quoted → Negotiating → Won.',
      'Set the next follow-up date — due follow-ups appear on your dashboard.', 'Click <b>Convert to customer</b> when they buy.'],
     'Website forms and ad leads can arrive automatically through the API.',
     ['Pipeline view', 'Follow-up reminders', 'Lead owner', 'One-click convert'],
     shot('Leads', '<div class="shot-body" style="display:flex;gap:6px;flex-wrap:wrap"><span class="tg" style="background:#efe7ff;color:#4B2A8C">New 12</span><span class="tg tag-due">Contacted 8</span>'
          '<span class="tg tag-due">Quoted 5</span><span class="tg tag-ok">Won 21</span><span class="tg tag-bad">Lost 4</span>'
          '<table style="margin-top:10px"><tr><th>Lead</th><th>Source</th><th>Follow-up</th></tr><tr><td>Neha Gupta</td><td>Website</td><td>Today</td></tr><tr><td>Rohit Jain</td><td>Referral</td><td>Tomorrow</td></tr></table></div>')),
    ('staff', 'Team', 'Staff logins, roles & permissions',
     'Give every staff member their own login and decide exactly what they can see and do.',
     ['Open <b>Staff / Users → Add</b> and choose a role: Admin, Accountant or Collector.', 'Owners can fine-tune any role in <b>Roles &amp; Permissions</b> — View, Add, Edit, Delete per page.',
      'Every action is recorded in the <b>Activity log</b>.'],
     'Passwords are encrypted, and staff can reset their own with a one-time code by email.',
     ['4 roles', 'Per-page permissions', 'Activity log', 'Password reset by OTP'],
     shot('Roles & permissions', '<div class="shot-body"><table><tr><th>Page</th><th>Admin</th><th>Accountant</th><th>Collector</th></tr>'
          '<tr><td>Invoices</td><td>V A E D</td><td>V A E</td><td>V</td></tr><tr><td>Payments</td><td>V A E D</td><td>V A E</td><td>V A</td></tr><tr><td>Expenses</td><td>V A E D</td><td>V A E</td><td>—</td></tr></table></div>')),
    ('reports', 'Insights', 'Reports & profit',
     'Know exactly how the business is doing.',
     ['Open <b>Reports</b> and pick monthly or yearly.', 'See billed vs collected, expenses, net profit, new customers and recovery rate.',
      'Print any report on A4 or export to CSV / PDF.'],
     'Area / branch balances show which location collects best.',
     ['Monthly & yearly', 'Profit (collected − expenses)', 'Branch-wise', 'Print & export'],
     shot('Reports', '<div class="shot-body"><div class="bars" style="height:120px"><i style="height:40%"></i><i style="height:55%"></i><i style="height:48%"></i><i style="height:70%"></i><i style="height:62%"></i><i class="hi" style="height:90%"></i></div>'
          '<div class="kv"><span>Collected this year</span><b>₹18.4L</b></div><div class="kv"><span>Recovery rate</span><b>91%</b></div></div>')),
    ('api', 'Integrations', 'API keys & automation',
     'Connect your website, Facebook/Google lead ads or any app.',
     ['Open <b>API &amp; Integrations → New API key</b> and copy the key (shown once).', 'In Zapier, Make or n8n add an HTTP request step and paste the endpoint and key.',
      'New leads, customers or tickets appear in your CRM instantly.'],
     'Each key works only for your business and can be revoked any time.',
     ['Leads, customers, tickets', 'Zapier / Make / n8n', '60 requests / minute', 'Revoke any time'],
     shot('API request', '<pre style="margin:0;background:#0f172a;color:#e2e8f0;padding:14px;font-size:12px;overflow:auto">{\n  "api_key": "amk_…",\n  "action": "leads.create",\n  "data": {\n    "full_name": "Ali Khan",\n    "phone": "98100 12345",\n    "source": "website"\n  }\n}</pre>')),
]

ALSO = ['Dashboard & action centre', 'Complaints / support tickets', 'Call logs & payment promises', 'Expenses & vendors', 'Bank accounts', 'Equipment / assets', 'Field collection runs',
        'Area / branch balances', 'Notifications', 'Customer documents', 'Monthly billing run', 'A4 print reports', 'CSV / PDF / print export', 'Business types (ISP, retail, agency, general)',
        'Indian cities & countries', 'Light / dark mode & 15 themes', 'Works on mobile', 'Your data in your own Google Drive (optional)', 'Activity log', 'Encrypted passwords']


def build_features():
    toc = ''.join(f'<a href="#{g[0]}">{g[2].split(" — ")[0].split(" with ")[0]}</a>' for g in GUIDE)
    secs = ''
    for i, (aid, num, title, intro, steps, tip, chips, pic) in enumerate(GUIDE, 1):
        st = ''.join(f'<li>{x}</li>' for x in steps)
        ch = ''.join(f'<span>{c}</span>' for c in chips)
        secs += (f'<div class="guide" id="{aid}"><div><div class="num">{i:02d} · {num}</div><h2>{title}</h2><p class="sub">{intro}</p>'
                 f'<ol>{st}</ol><div class="tip"><i class="fas fa-lightbulb"></i> {tip}</div><div class="chips">{ch}</div></div>{pic}</div>')
    also = ''.join(f'<span>{a}</span>' for a in ALSO)
    body = f"""  <header class="page-hero"><div class="wrap">
    <div class="crumbs"><a href="/">Home</a> › Features &amp; guide</div>
    <h1>Every feature, and <span class="gold">how to use it.</span></h1>
    <p class="lead">A complete guide to AR Medias CRM — what you get, and step-by-step how to do each thing. {len(GUIDE) + len(ALSO)}+ features in every plan.</p>
    <div class="toc">{toc}</div>
  </div></header>
  <section style="padding-top:10px"><div class="wrap">{secs}</div></section>
  <section class="soft"><div class="wrap">
    <div class="head center"><div class="kicker">Also included</div><h2>And everything else a business needs.</h2></div>
    <div class="chips" style="justify-content:center;max-width:960px;margin:0 auto">{also}</div>
  </div></section>
{CTA}"""
    write('/features', layout('/features', 'Features & how to use AR Medias CRM — complete guide',
                              'Step-by-step guide to every AR Medias CRM feature: customers, GST invoices, live billing, WhatsApp bills, recovery, leads, staff roles, reports and API.',
                              body, [org_ld()]))


COMPARE = [('Staff logins', '3', 'Unlimited'), ('Customers', '1,000', 'Unlimited'), ('Invoices, GST calculator & live billing', 1, 1), ('Payments, receipts & recovery board', 1, 1),
           ('WhatsApp & email bills (links, PDF)', 1, 1), ('Leads, complaints, calls & reports', 1, 1), ('Roles & permissions, activity log', 1, 1),
           ('Official WhatsApp Business API', 0, 1), ('API keys & integrations', 0, 1), ('Priority support & onboarding', 0, 1), ('Custom features & changes', 0, 'On request')]

PRICE_FAQ = [
    ('Can I pay monthly?', 'Plans are billed every 6, 12 or 24 months — that is how we keep prices this low. The monthly figure shown is just for comparison.'),
    ('How much do I save?', '20% on 6 months, 30% on 12 months and 35% on 24 months, compared with the ₹ per-month list price.'),
    ('Is GST included?', 'Prices are shown without GST; 18% GST is added on your invoice.'),
    ('Can I upgrade later?', 'Yes. Move from Small Business to Enterprise any time — we adjust the remaining amount.'),
    ('How do I pay?', 'Online payment is coming soon. Today, after your trial you choose a plan and pay by UPI or bank transfer; we activate it the same day.'),
    ('What if I need more than 1,000 customers or 3 staff?', 'Choose Enterprise — no limits on customers or staff.'),
]


def build_pricing():
    rows = ''
    for name, a, b in COMPARE:
        cell = lambda v: '<span class="y"><i class="fas fa-check"></i></span>' if v == 1 else ('<span class="n">—</span>' if v == 0 else v)
        rows += f'<tr><td>{name}</td><td>{cell(a)}</td><td>{cell(b)}</td></tr>'
    body = f"""  <header class="page-hero"><div class="wrap center">
    <div class="crumbs"><a href="/">Home</a> › Pricing</div>
    <h1>Simple pricing. <span class="gold">Save up to 35%.</span></h1>
    <p class="lead" style="margin:0 auto">Small Business from {inr(PLANS['small']['month'])}/month, Enterprise from {inr(PLANS['enterprise']['month'])}/month. Billed every 6, 12 or 24 months. Start with a {TRIAL_DAYS}-day free trial.</p>
  </div></header>
  <section class="soft"><div class="wrap">{pricing_block()}</div></section>
  <section><div class="wrap" style="max-width:900px">
    <div class="head center"><div class="kicker">Compare</div><h2>What's in each plan.</h2></div>
    <table class="compare"><tr><th>Feature</th><th>Small Business</th><th>Enterprise</th></tr>{rows}</table>
  </div></section>
  <section class="soft"><div class="wrap" style="max-width:820px">
    <div class="head center"><div class="kicker">Billing FAQ</div><h2>Questions about pricing.</h2></div>
    <div class="faq">{faq_html(PRICE_FAQ)}</div>
  </div></section>
{CTA}"""
    write('/pricing', layout('/pricing', 'Pricing — AR Medias CRM | from ₹299/month, save up to 35%',
                             f'AR Medias CRM pricing: Small Business ₹299/month and Enterprise ₹1,200/month, billed 6, 12 or 24 months with 20–35% off. {TRIAL_DAYS}-day free trial.',
                             body, [org_ld(), app_ld(), faq_ld(PRICE_FAQ)]))


def build_enterprise():
    blocks = [('fa-puzzle-piece', 'Custom modules', 'Stock & inventory, job cards, appointments, field service, approvals — built around how you work.'),
              ('fa-plug-circle-bolt', 'Integrations', 'Payment gateways, Tally / accounting exports, websites, ad platforms, WhatsApp Business API and your existing tools.'),
              ('fa-code-branch', 'Multiple branches', 'Branch-wise teams, billing and reports, with head-office visibility across everything.'),
              ('fa-file-import', 'Data migration', 'We import your customers, balances and history from Excel or your old software.'),
              ('fa-robot', 'AI & automation', 'Auto-reminders, lead routing, smart follow-ups and AI chat assistants for your customers.'),
              ('fa-headset', 'Priority support', 'Onboarding for your team, a direct line to our developers and fast fixes.')]
    cards = ''.join(f'<div class="card"><div class="ic"><i class="fas {i}"></i></div><h3>{t}</h3><p>{d}</p></div>' for i, t, d in blocks)
    m12 = price('enterprise', 12, 30)[1]
    body = f"""  <header class="page-hero"><div class="wrap">
    <div class="crumbs"><a href="/">Home</a> › Enterprise</div>
    <h1>Enterprise CRM, <span class="gold">built around you.</span></h1>
    <p class="lead">Everything in AR Medias CRM — unlimited staff and customers, official WhatsApp API and integrations — plus custom features made by the AR Medias team.</p>
    <div class="hero-ctas" style="margin-top:24px"><a class="btn btn-orange" href="{CONTACT}" target="_blank" rel="noopener">Talk to us <i class="fas fa-arrow-right"></i></a><a class="btn btn-ghost" href="/app?signup">Start free trial</a></div>
  </div></header>
  <section><div class="wrap">
    <div class="head center"><div class="kicker">What we build</div><h2>Your CRM, your way.</h2><p class="sub">Tell us how your business runs. We'll shape the CRM to fit — or build something completely new.</p></div>
    <div class="grid g3">{cards}</div>
  </div></section>
  <section class="soft"><div class="wrap" style="max-width:900px">
    <div class="grid g2" style="align-items:center">
      <div><div class="kicker">Enterprise plan</div><h2>From {inr(PLANS['enterprise']['month'])}/month</h2>
        <p class="sub">{inr(m12)} for 12 months (30% off) · 20% off on 6 months · 35% off on 24 months. Custom development is quoted separately after a free consultation.</p>
        <a class="more-link" href="/pricing">See full pricing <i class="fas fa-arrow-right"></i></a></div>
      <div class="cta-band" style="flex-direction:column;align-items:flex-start">
        <h2 style="font-size:26px">Have a project in mind?</h2><p>Book a free call or send us your requirements — we reply within one working day.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-orange" href="{CONTACT}" target="_blank" rel="noopener">Contact AR Medias</a><a class="btn btn-ghost" href="{MAIN}" target="_blank" rel="noopener">Visit armedias.com</a></div>
      </div>
    </div>
  </div></section>
{CTA}"""
    write('/enterprise', layout('/enterprise', 'Enterprise CRM & custom software — AR Medias CRM',
                                'Enterprise CRM for Indian businesses: unlimited users, WhatsApp Business API, integrations, multi-branch, data migration and custom modules built by AR Medias.',
                                body, [org_ld()]))


INDUSTRIES = [
    ('/crm-for-isp', 'CRM & billing software for ISPs and cable operators', 'ISP billing software',
     'Run your internet or cable business: packages and speeds, monthly billing for every subscriber, area-wise recovery and field collection.',
     ['Packages with speed & price', 'One-click monthly billing for all subscribers', 'Area-wise balances & recovery board', 'Field collection runs & visits', 'Router / ONU equipment tracking', 'Suspend / reconnect / disconnect'],
     'ISP billing software, cable TV billing software, broadband subscriber management, internet billing software India'),
    ('/billing-software-for-shops', 'Billing software & CRM for shops and retail', 'Retail billing software',
     'Counter billing with GST, customer credit (udhaar) tracking, product list and WhatsApp bills — made for clothing, electronics, grocery and every shop.',
     ['Live billing with products & quantity', 'GST & discount calculator', 'Customer credit / udhaar tracking', 'WhatsApp & email bills', 'Branches & staff logins', 'Daily, monthly & yearly reports'],
     'billing software for shops, GST billing software, retail billing software India, clothing shop billing software'),
    ('/crm-for-agencies', 'CRM for marketing agencies and service businesses', 'Agency CRM',
     'Manage clients, monthly retainers, one-time projects, leads and support tickets — and send invoices that get paid faster.',
     ['Clients & services', 'Monthly retainer billing', 'Lead pipeline & follow-ups', 'Support tickets', 'Team roles & permissions', 'API for website & ad leads'],
     'CRM for agencies, digital marketing agency CRM, service business CRM India, client management software'),
]


def build_industries():
    for path, h1, kicker, intro, points, kw in INDUSTRIES:
        lis = ''.join(f'<li><i class="fas fa-circle-check"></i>{p}</li>' for p in points)
        body = f"""  <header class="page-hero"><div class="wrap">
    <div class="crumbs"><a href="/">Home</a> › {kicker}</div>
    <h1>{h1.split(' for ')[0]} <span class="gold">for {h1.split(' for ', 1)[1]}.</span></h1>
    <p class="lead">{intro}</p>
    <ul class="ind-hero-list">{lis}</ul>
    <div class="hero-ctas" style="margin-top:22px"><a class="btn btn-orange" href="/app?signup">Start {TRIAL_DAYS}-day free trial <i class="fas fa-arrow-right"></i></a><a class="btn btn-ghost" href="/pricing">See pricing</a></div>
  </div></header>
  <section><div class="wrap">
    <div class="head center"><div class="kicker">Everything included</div><h2>All the tools, ready on day one.</h2></div>
    <div class="grid g3">{feature_cards()}</div>
    <div class="center"><a class="more-link" href="/features">See how each feature works <i class="fas fa-arrow-right"></i></a></div>
  </div></section>
  <section class="soft"><div class="wrap">{pricing_block()}</div></section>
{CTA}"""
        write(path, layout(path, f'{h1} — AR Medias CRM', f'{intro} {TRIAL_DAYS}-day free trial. Keywords: {kw}.'[:300], body, [org_ld(), app_ld()]))


def build_sitemap():
    paths = ['/', '/features', '/pricing', '/enterprise'] + [i[0] for i in INDUSTRIES]
    urls = ''.join(f'<url><loc>{SITE}{p}</loc><changefreq>weekly</changefreq><priority>{"1.0" if p == "/" else "0.8"}</priority></url>' for p in paths)
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w') as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>')
    with open(os.path.join(ROOT, 'robots.txt'), 'w') as f:
        f.write(f'User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /b\n\nSitemap: {SITE}/sitemap.xml\n')
    print('built sitemap.xml, robots.txt')
    return paths


if __name__ == '__main__':
    build_home(); build_features(); build_pricing(); build_enterprise(); build_industries(); build_sitemap()
