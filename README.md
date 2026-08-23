# Cashora

Production-grade personal finance dashboard. Built under the KRIXORA brand.
Runs entirely from static files + Supabase — no server to host or run yourself.

## Structure

```
cashora/
├── index.html              # App shell only: sidebar, topbar, modal, #pageRoot (empty)
├── auth.html                # Login / signup / forgot-password page
├── reset-password.html      # Landed on from the reset-link email; sets a new password
├── manifest.json             # PWA manifest — enables "Add to Home Screen"
├── vercel.json                # Security headers for the deployed site
├── backend-supabase/
│   └── schema.sql            # Run this once in Supabase's SQL Editor
├── css/
│   ├── reset.css            # Browser normalization
│   ├── tokens.css           # Design tokens: color, type, spacing (single source of truth)
│   ├── layout.css           # Grid/flex page structure, header, sidebar
│   ├── components.css       # Reusable UI: buttons, cards, inputs, badges, modals, toasts, pagination
│   ├── dashboard.css        # Page-specific: charts, stat cards, gauges
│   └── main.css             # Imports everything, in cascade order
├── js/
│   ├── router.js             # Hash-based router — mounts one view at a time into #pageRoot
│   ├── views/                # One file per screen, each exporting template()
│   │   ├── dashboard.js
│   │   ├── transactions.js
│   │   ├── budget.js
│   │   ├── goals.js
│   │   ├── insights.js
│   │   ├── analytics.js
│   │   └── settings.js
│   ├── supabaseClient.js    # Supabase connection (paste your project URL + key here)
│   ├── state.js              # In-memory cache backed by Supabase, CRUD operations
│   ├── icons.js              # Hand-authored SVG icon set (no emoji, no external library)
│   ├── utils.js              # Formatters (currency, date), helpers, toast notifications
│   ├── transactions.js      # DOM rendering for tables/cards/lists (render layer, not routing)
│   ├── charts.js             # Canvas chart rendering (cash flow, budget gauge, donut, ring)
│   └── app.js                 # Entry point: auth guard, boots router, wires events, initial data load
└── assets/
    ├── icons/                # PWA icons (icon-192.webp, icon-512.webp, apple-touch-icon.webp)
    ├── images/
    └── fonts/
```

### Routing (Phase 8)
`index.html` no longer contains all seven screens stacked on one giant page. Each
screen (Dashboard, Transactions, Budget, Goals, Insights, Analytics, Settings) is
its own file under `js/views/`, and `js/router.js` mounts exactly one of them into
`#pageRoot` based on the URL hash (`#dashboard`, `#transactions`, ...). Navigating
the sidebar swaps the DOM instead of scrolling a single long page. Any event
listener for content inside a view is delegated from `#pageRoot` in `app.js`
(rather than bound directly to elements), since those elements are replaced on
every navigation.

## Setup (all from a phone browser — no terminal needed)

1. **Create a Supabase project** at supabase.com → New Project.
2. **Run the schema**: Project → SQL Editor → New Query → paste `backend-supabase/schema.sql` → Run.
3. **Get your keys**: Project Settings → API → copy "Project URL" and "anon public" key.
4. **Paste them** into `js/config.js` (or copy `js/config.local.example.js` → `js/config.local.js` and fill in — that file is gitignored).
5. **Deploy**: push this folder to a GitHub repo (GitHub mobile app supports file upload/edit), then import that repo into Vercel. Vercel auto-detects it as a static site — no build config needed.
6. **Allow the reset-password redirect**: in Supabase → Authentication → URL Configuration, set **Site URL** to your deployed URL (e.g. `https://cashora.vercel.app`) and add `https://cashora.vercel.app/reset-password.html` under **Redirect URLs**. Without this, the "Forgot password?" email link won't be able to land on `reset-password.html`.
7. Visit your deployed URL → `/auth.html` → sign up → you're in.

## Conventions
- CSS: BEM-lite naming (.card, .card__header, .card--highlighted)
- JS: vanilla ES modules, no framework, no build step
- All colors/spacing/type come from tokens.css variables — never hardcode values in components
- Mobile-first responsive breakpoints: 480px / 768px / 1024px / 1440px
- No emoji anywhere in UI — all icons are hand-authored SVGs in js/icons.js
- Auth + database: Supabase (Postgres + built-in auth + Row Level Security)

## Phases
- [x] Phase 0 — Architecture & setup
- [x] Phase 1 — Design system (tokens.css)
- [x] Phase 2 — Static UI (all pages, HTML + CSS)
- [x] Phase 3 — Core JS logic (state, CRUD, charts)
- [x] Phase 4 — Backend + real auth (Supabase: Postgres, Auth, Row Level Security)
- [x] Phase 5 — Advanced features (real financial health score, rule-based spending insights, cash-flow range filters, category legend)
- [x] Phase 6 — Testing, security, performance (see checklist below)
- [x] Phase 7 — Deployment (live on Vercel, security headers via vercel.json)
- [x] Phase 8 — Real routing & file structure (per-screen views under js/views/, hash router, delegated events)
- [x] Phase 9 — Production polish (forgot password, installable PWA, transaction pagination, custom categories, accessibility)
- [x] Phase 10 — Correctness fix: monthly figures are actually monthly (see below)
- [x] Phase 11 — Recurring transactions + Analytics "This Month / All Time" toggle
- [x] Phase 12 — Production hardening
- [x] Phase 13 — Production finance features (net worth, debts, CSV import, safe-to-spend, 50/30/20, subscriptions, bills, JSON backup) (CSP/HSTS, service worker PWA, secrets hygiene, audit log, offline banner, smoke tests, chart a11y)

## Phase 11 additions
- **Recurring transactions**: when adding a transaction, check "Repeat this transaction"
  and pick Weekly/Monthly. There's no backend cron (this is a static frontend) — instead,
  every time the app boots it checks each active rule and catches up any occurrences that
  came due since you last opened it, inserting them as normal transactions. Manage/cancel
  active rules from Settings → Recurring Transactions.
  **Requires a one-time migration** — run `backend-supabase/migration_recurring.sql` in
  Supabase's SQL Editor. If you skip it, the app still works fine; it just quietly treats
  recurring as unavailable (logs a console warning) instead of breaking.
- **Analytics scope toggle**: "This Month" / "All Time" tabs above the category donut,
  since the correctness fix above made everything default to the current month.

## Phase 10 fix: "Monthly" now means this calendar month
Until this pass, "Monthly Income", "Monthly Expense", the Budget Planner, category
breakdowns, the Financial Health Score, and Spending Insights were all silently
computed over **all transactions ever added** — not the current month. That meant
a budget would look permanently "exceeded" the moment lifetime spend crossed the
limit once, and never reset. The "+12% / +4% vs last month" text was also just
static placeholder copy, not a real calculation.

Fixed by adding `getMonthlyTotals(monthOffset)` and scoping `getCategoryBreakdown()`
to the current calendar month by default (state.js). Budgets, insights, and the
health score now all correctly reset each month. The two stat-card deltas are now
computed for real (`this month vs last month`, state.js + transactions.js). "Total
Balance" is intentionally left as a lifetime cumulative figure, since that's what
"balance" means.

## Security
- **Row Level Security** on every table — each user can only ever read/write their own rows (enforced in Postgres itself, not just the client).
- Only the Supabase **anon public key** ships to the browser. The `sb_secret_...` service key is never used client-side and must never be committed.
- All user-entered text (transaction titles, goal names) is HTML-escaped before rendering — prevents stored XSS.
- Email/password validated client-side (format, min length) *and* server-side by Supabase Auth.
- `vercel.json` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy` on every response.
- Transaction amounts are bounded (₹0.01–₹1,00,00,000) and dates can't be set in the future, both in the HTML inputs and again in JS before the Supabase call.

## Manual QA checklist
No build tooling means no automated test runner here — this project is tested manually against real Supabase data before each deploy. Run through this list after any change:

- [ ] Sign up with a new email → lands on dashboard without needing email confirmation
- [ ] Sign out → redirected to `/auth.html`; visiting `/index.html` directly also redirects (auth guard)
- [ ] Wrong password on login → error message stays visible (not just a flash)
- [ ] Add a transaction (income and expense) → stat cards, charts, and category list all update immediately
- [ ] Try submitting the Add Transaction form empty, with a negative amount, and with a future date → each is blocked with a clear message
- [ ] Delete a transaction → confirm prompt appears, row disappears, totals recalculate
- [ ] Search bar filters the transaction tables live
- [ ] Cash Flow chart tabs (1M/3M/1Y) change the chart data
- [ ] Set a budget limit, then add an expense that crosses 85%/100% of it → Spending Insights shows the matching alert
- [ ] Financial Health Score changes when income/expenses/budgets change (not a fixed number)
- [ ] Resize to a small phone width (~360px) → topbar, cards, and charts stay inside the viewport, no horizontal scroll
- [ ] Reload on a slow connection → loading spinner shows until data is ready, no flash of empty dashboard
- [ ] Export CSV → file downloads with correct transaction data
- [ ] Edit an existing transaction → form pre-fills correctly, save updates the same row (not a duplicate)
- [ ] Set a budget, edit its limit, then delete it → Budget Planner reflects each step immediately
- [ ] Create a goal, edit its saved amount, then delete it → Goals grid reflects each step immediately
- [ ] Bell icon shows a badge when there are active insights, opens/closes on tap, and closes on outside tap or Escape
- [ ] Change name/email in Settings → toast confirms; changing email specifically mentions checking the new inbox
- [ ] Refresh mid-navigation on any route (e.g. reload while on `#budget`) → that same screen loads directly, not just the dashboard
- [ ] Tap "Forgot password?" → enter email → reset email arrives → link opens `reset-password.html` → new password saves and signs you in
- [ ] On a phone browser, "Add to Home Screen" shows the Cashora icon and opens standalone (no browser address bar)
- [ ] Add 20+ transactions → "All Transactions" paginates instead of listing everything at once; Prev/Next disable at the first/last page
- [ ] In the Add Transaction or Set Budget modal, choose "+ Add custom category…", type a new name, save → it appears as a normal option next time you open either modal
- [ ] Open any modal, press Tab repeatedly → focus cycles within the modal and never escapes to the page behind it; Escape still closes it
- [ ] Monthly Income/Expense deltas ("+X% vs last month") reflect real numbers, not a fixed placeholder — add a transaction and confirm the percentage changes
- [ ] Budget Planner: a budget that showed 100%+ used stays capped for the current month, and should read back down to 0% used once the calendar rolls into a new month (can't test live — verify the underlying date math in `getMonthlyTotals`/`getCategoryBreakdown` in state.js if in doubt)
- [ ] Add a transaction with "Repeat this transaction" checked (Monthly) → it appears once now, and a rule for it shows up in Settings → Recurring Transactions with the correct next date
- [ ] Delete a recurring rule from Settings → it stops appearing, but transactions it already created are untouched
- [ ] Analytics page: toggle "This Month" / "All Time" → donut chart and legend both update to match
- [ ] Analytics page in a month with zero expenses → shows "No expenses yet" instead of a leftover chart from a previous month
- [ ] If a recurring rule's next date is in the past when you open the app (e.g. you skipped a week), it silently catches up and shows a toast like "Added 1 recurring transaction that came due since your last visit"

## Phase 12 — Production hardening
- **Content-Security-Policy + HSTS** in `vercel.json` (plus existing frame/nosniff headers).
- **Service worker** (`sw.js`): caches the static shell for installable/offline UI; **never** caches Supabase API/auth responses.
- **Secrets hygiene**: real keys removed from source. Put credentials in `js/config.js` or gitignored `js/config.local.js` (see `js/config.local.example.js`).
- **Client write cooldown** + max-amount checks aligned with DB constraints.
- **Audit log + soft-delete columns**: run `backend-supabase/migration_production.sql` once (optional but recommended).
- **Offline banner** when the browser reports no network.
- **Chart accessibility**: canvas elements expose `role="img"` + descriptive `aria-label`.
- **Smoke tests**: `node tests/smoke.mjs` (no npm required).

### Extra production migration
After `schema.sql` (and optional `migration_recurring.sql`), run:
```
backend-supabase/migration_production.sql
```
This adds `deleted_at` / `updated_at`, an append-only `audit_log` table (RLS-protected), and triggers.

### Run smoke tests
```bash
node tests/smoke.mjs
```


## Phase 13 — Production finance features
Requires `backend-supabase/migration_features.sql` once in Supabase SQL Editor.

| Feature | Where |
|---------|--------|
| **Net worth** (manual assets/liabilities) | Net Worth page |
| **Debt payoff** (avalanche / snowball) | Net Worth page |
| **Safe to spend** | Dashboard chip + Net Worth |
| **50/30/20 rule** | Net Worth page |
| **Upcoming bills** (from recurring) | Net Worth page |
| **Subscription detection** | Analytics |
| **Month vs last month** | Analytics |
| **CSV import** | Settings → Import CSV |
| **JSON full backup** | Settings → Full Backup |
| **Transaction notes** | Add/Edit transaction modal |
| **Onboarding checklist** | Dashboard (until complete) |

Bank linking (Plaid) is intentionally out of scope for this static + Supabase architecture.
