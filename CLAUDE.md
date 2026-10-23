# Project: branch & order management platform (Algerian COD e-commerce)

## Who and what
- Owner: **Yassine** (media buyer, Algiers). He runs ~8 family-run "branches" that pack parcels and hand them to local delivery companies. He speaks **Algerian darija**.
- Goal: replace Octomatic for confirmation/tracking and replace the Excel sheets for stock, product accounting and branch settlement. Details: `docs/cahier-des-charges.md` (Arabic, written with and approved by Yassine, section by section).
- `docs/prototype.html` is an **interactive UI prototype** (single file, fake in-memory data). Treat it as the behaviour reference. It is NOT production code: no database, no auth, no real integrations.

## How to talk to Yassine
- Algerian darija, plain words. Never use Moroccan words: not "دابا" (say "ذركا" or "دكا"), not "الفلوس" (say "الدراهم" or "الموني"), not "يتسالاو" (say "يتليفراو" or "يتسلمو").
- Ask before assuming. If something looks like an error in his data, ask, do not silently fix it.
- Be honest about what is demo, what is real, and what you could not test.

## Product rules that are already decided (see the cahier for all details)
- Roles: manager (Yassine), confirmer (unlimited number), branch, suivi (one per branch), dispatch worker (send-only). Row-level security enforces visibility; the UI is not the security boundary.
- Accounts are created by the manager (name, email, phone, join date, role). Yassine chose: the manager sets the password and it stays unchanged. Implement through the auth provider's admin API, hash only, show once, never log or store plain text, and tell him the recommendation (different password per user, ability to reset and lock accounts).
- One product belongs to exactly one branch. Variants are colour + size.
- Order flow: sheet or direct entry, confirm, 10-minute wait (configurable; the countdown never resets), automatic send to the branch's delivery company by API. Manager or dispatch worker can send early, one by one or all at once. After sending, delivery companies cannot edit or cancel: notes only.
- An order with products from different branches is split into one parcel per branch (own tracking number and delivery price). Same branch means one parcel.
- Confirmers do not know branches or delivery companies, and cannot tell an abandoned-checkout order from a normal one. Abandoned and normal sheets have different columns: each source needs its own column mapping.
- Confirmer pay: 50 DA per confirmed order (including later returns), counted in monthly cycles starting at the confirmer's join date. Cancelling during the wait removes it.
- Blacklist ("ليست نوار"): numbers of customers who are not serious. Confirmers and suivi can add; only the manager can delete. A blacklisted number never reaches confirmers or suivi. Permanent storage.
- Returns: the branch never types; it selects (parcel from a list, or product, colour, size, quantity 1 to 70). A return restores stock.
- Accounting: product profit = sales (net received from delivery company) minus all costs; whole purchase batch counts as cost; leftover stock counts as profit when result is positive; negative result is "قيد البيع" or "خسارة" depending on a flag. Branch settlement: 50/50 branch returns ads + half of profit (or half of loss); monthly branches and ads-only branch return ads only. Formulas and defaults are in the cahier.
- The AI assistant is manager-only, runs only when he sends a message, and only assigns products to confirmers through tools.

## Engineering rules
- Suggested stack (confirm with Yassine first): Next.js + TypeScript, Supabase (Postgres, Auth, RLS), Vercel, scheduled jobs for the 10-minute send and sheet sync. Arabic RTL, mobile first, PWA.
- Secrets only in server environment variables. Never commit keys. Never ask Yassine to paste keys into chat.
- Every write to money, stock, blacklist, orders is audit-logged.
- No real customer data in development; use seed data.
- Work in the phases of the cahier (section "مراحل البناء"). Small commits, migrations, tests for the accounting formulas and for RLS (try to read another role's data and expect failure).
- Stop and ask when an input is missing: delivery company API docs, sheet links and columns, delivery account for each branch.
