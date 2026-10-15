# Household Money

Our own corner for tracking every shilling. M-Pesa messages flow in automatically (MacroDroid → Supabase), you only **label** them.

```
M-Pesa SMS ─► MacroDroid ─► Edge Function `ingest` ─► raw_messages + transactions ─► presets auto-label
                                                                  │
                                    React PWA: Labels · Snapshot · Projects & presets
```

## What's in the box

| Path | What it is |
|---|---|
| `migrations/0001_init.sql` | Whole database: tables, rules engine, balance-chain view, access gate, seed categories |
| `migrations/0002_backfill_sep_oct_2026.sql` | Account-aware presets, transfers, and the Sep–Oct 2026 history |
| `migrations/0003_project_phases_goals.sql` | Project save/spend phases, income goals, M-Shwari clean-up. Run once in the SQL editor, then redeploy the app |
| `migrations/0004_savings_settings.sql` | Savings categories (emergency fund etc.) and a small settings table. Run once after 0003 |
| `supabase/functions/ingest/` | Webhook that receives the SMS, stores it raw, parses it, runs presets |
| `src/` | The React app (Vite + TypeScript + Tailwind + Recharts), installable as a PWA |
| `scripts/test-parser.ts` | Parser checks against real messages (`npm run test:parser`) |

## Setup (about 15 minutes)

### 1. Database
1. Create a Supabase project (or use an existing one).
2. SQL Editor → paste all of `migrations/0001_init.sql` → Run.
   (Using the CLI instead? Copy it to `supabase/migrations/` and `supabase db push`.)
3. Set the **household key**, a long random string you make up. Both phones will use it:
   ```sql
   insert into private.app_config (key, value) values ('app_key', 'PICK-A-LONG-RANDOM-STRING')
   on conflict (key) do update set value = excluded.value;
   ```

### 2. The webhook
```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set INGEST_SECRET=ANOTHER-LONG-RANDOM-STRING
supabase functions deploy ingest --no-verify-jwt
```
(`--no-verify-jwt` is also set in `supabase/config.toml`; the function checks `INGEST_SECRET` itself.)
Your endpoint is: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/ingest?key=ANOTHER-LONG-RANDOM-STRING`

### 3. MacroDroid
- **Trigger:** SMS Received, sender `MPESA` (match what the sender shows on your phone).
- **Action:** HTTP Request
  - Method `POST`, URL = the endpoint above
  - Content type `text/plain`
  - Body = the SMS message text. Use MacroDroid's **Magic Text** picker and choose the SMS message body.
- Send yourself a test, then check the `raw_messages` table. The first real payload tells us if anything needs tuning. The function also accepts JSON (`{"message": "..."}`) and form posts, and if it can't read a message it keeps it as `unparsed` and shows a warning in the app instead of losing it.

### 4. The app
```bash
cp .env.example .env      # fill in URL + anon key from Project Settings → API
npm install
npm run dev               # or: npm run build  → deploy dist/ to Vercel/Netlify
```
Open the deployed URL on each phone → browser menu → **Add to Home screen**.

> **About the key.** `VITE_APP_KEY` in `.env` gets baked into the built JavaScript. If you host the app on a public URL, leave `VITE_APP_KEY` **out** and the app asks for the key once per phone instead (stored on that phone only).

## Backfilling history from an M-Pesa statement

`migrations/0002_backfill_sep_oct_2026.sql` loads 1 Sep – 14 Oct 2026 (479 transactions) from the statement PDF. Run it **once in the SQL editor, then redeploy the app straight away** (it changes the presets table, so don't label anything in between). It is safe to re-run: existing M-Pesa codes are never duplicated or relabeled.

- **Charges** are separate rows in the statement; they are folded into each payment's `fee`.
- **Names** are normalised to match the SMS style (upper-case, `0741***343` phone format), so history and live messages land under the same payee.
- **Balance chain:** the statement's running balance checks out across all 479 transactions, and the totals match the statement to the cent.

## Presets look backward too

Labeling a transaction with "Auto-label next time" saves a preset **and immediately scans every unlabeled transaction, old or new**, labeling the ones that match. Presets match the payee **and, for paybills, the account**: `EQUITY PAYBILL ACCOUNT` + `331351#Tithes` is a different thing from the same paybill + a person's phone number. For families of look-alike names (like `NICCO MOVERS - KDU 918W`), add a preset under Projects → Presets with **Name contains** `NICCO MOVERS`.

Account matching: `Any` | `Only when there is no account` (a person or till) | `Only this account`.

## Transfers

Moves between your own accounts (M-Shwari) are a third category kind, **Transfers**. They show on the Snapshot ("Moved between your own accounts") but are never counted as income or spending; their transaction costs still are. A seeded preset labels M-Shwari moves automatically.

## How it behaves

- **Labels:** every unlabeled transaction, two labels each: *what* (particulars) and *category*. For money out, flip *Expense / Project* to attribute it to a project. "Auto-label next time" (on by default) saves a preset and instantly labels any other waiting transactions that match.
- **Snapshot:** income first, then spent / left over / transaction costs, breakdown donuts (unlabeled shows as its own grey slice so nothing hides), cash flow, M-Pesa balance over time, projects, activity. Day / Week / Month with arrows. Times are East Africa Time.
- **Balance chain check:** every message carries the new balance. If previous balance ± this transaction doesn't equal it, a message went missing, and the Snapshot flags it with the unexplained amount.
- **Presets:** match on name, phone or account, "is exactly" or "contains". Exact beats contains, longer beats shorter. Seeded: `TINGG → Airtime`.
- **Categories:** seeded, fully editable, and there is deliberately no "Other".
- **Duplicates:** the M-Pesa code is unique, so a message pushed twice is ignored.
- **Mistakes:** the ↺ button in Activity sends a transaction back to Labels.

## Message formats the parser knows
`paid to`, `sent to` (including Pay Bill `for account …`), `received … from`, `withdrawn from`, `bought … of airtime`. To teach it a new one, add a pattern in `supabase/functions/ingest/parser.ts`, add the sample to `scripts/test-parser.ts`, run `npm run test:parser`, redeploy.

## Security model (honest version)
No Supabase Auth. The database only answers requests that carry the household key (`x-app-key` header, checked by row level security), and the webhook only accepts `INGEST_SECRET`. The service-role key lives only inside the Edge Function. That's right for a two-person app. If it ever grows, swap in Supabase Auth.

## Projects: saving vs spending
Labeling money out for a project asks which phase it is. **Saving for it** counts as Savings (never an expense). **Spent on it** is an expense and uses up that project's savings. Each project card shows Saved, Spent and Savings left.

## Goals
The Goals tab holds a monthly, a 3-month and a 6-month income goal. A goal applies from the month you pick, so past months keep the goal they had. M-Shwari moves never count as income.

## Webhook health
The Snapshot shows when the webhook last heard an SMS, and **Add a missed message** lets you paste an M-Pesa SMS the phone never forwarded. The parser now understands M-Shwari messages and reads the M-PESA balance (not the M-Shwari one) so the balance chain stays intact. Redeploy the `ingest` function after pulling.
