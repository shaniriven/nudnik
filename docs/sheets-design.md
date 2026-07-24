# Cash Flow Google Sheet — Table Design Spec

Handoff doc for the coding agent. Three tabs: `Transactions` (raw ledger), `Categories` (reference/dropdowns), `Dashboard` (calculated overview).

## Tab 1: Transactions (the source of truth — one row per confirmed transaction)

| Column | Type | Notes |
|---|---|---|
| A — Transaction ID | Text | Auto-generated, e.g. `TX-0001`. Lets you reference/edit a row later without ambiguity. |
| B — Receipt Date | Date | The date on the receipt/invoice itself (the actual transaction date). |
| C — Received Date | Date | The date the email/receipt arrived in your inbox — useful for spotting delays between when money moved and when you found out about it, and for debugging the scanner. |
| D — Type | Dropdown: Income / Expense | Drives every calculation downstream. |
| E — Category | Dropdown (from Categories tab) | e.g. Inventory/COGS, Rent, Marketing, Software, Bar Sales. |
| F — Vendor / Source | Text | Who you paid or who paid you. |
| G — Description | Text | Short free text, from AI extraction or your edit. |
| H — Amount | Number | In ILS by default. If a rare non-ILS receipt comes in, note the original amount/currency in the Notes column and enter the converted ILS value here — no live conversion system needed. |
| I — Payment Method | Dropdown | Credit Card, Bank Transfer, Cash, Bit, PayPal, Other. |
| J — Status | Dropdown: Approved / Edited | Every row is auto-set to Approved when the bot inserts it (since a row only ever gets written after Telegram confirmation — nothing "Pending" or "Rejected" ever reaches the sheet). Change it to Edited manually if you go back and correct a row later. |
| K — Source | Dropdown: Email / Telegram Photo / Manual / Z-Report | Useful once you merge the email-scanner, photo-bot, and Z-report entry into one ledger. |
| L — Submitted By | Text | Telegram name/username of whoever confirmed the entry — worker or admin. |
| M — Submitter Role | Dropdown: Admin / Worker | Distinguishes who submitted the entry — relevant since only admins view the sheet itself but workers can still submit Z-reports through the bot. |
| N — Approval Date | Timestamp | When you approved it in Telegram. |
| O — Attachment Link | URL | Link to the receipt image/email stored in Drive — critical for your accountant later. |
| P — Notes | Text | Manual edits, corrections, disputes, original currency if non-ILS. |
| Q — Running Balance | Formula | `=IF(D2="Income", H2, -H2) + Q1` (previous row + this row). Reflects your balance after each entry gets confirmed and logged, in insertion order — not tied to Receipt Date. The bottom row is always your true current balance. |

### Design decisions

- **Only write a row after Telegram confirmation.** Don't pre-write "Pending" rows — it's cleaner to keep this tab as pure ground truth.
- **Single Amount column, ILS by default** — no exchange-rate table or live conversion needed since almost everything will already be in shekels. If an occasional foreign-currency receipt shows up, convert it once manually at confirmation time and log the original in Notes.
- **Running Balance follows insertion order, not Receipt Date.** A simple cumulative formula, so it always reflects the correct current balance at the bottom of the sheet. Mid-sheet, a given row's balance means "the total after this entry was confirmed," not "the total as of that receipt's date."

## Tab 2: Categories (reference list — powers dropdowns + keeps naming consistent)

| Category | Type | Notes |
|---|---|---|
| Bar Sales | Income | Drink/food sales rung up at the bar |
| Event / Cover Charges | Income | Entry fees, private event bookings |
| Refunds Received | Income | |
| Other Income | Income | |
| Inventory / COGS | Expense | Cost of Goods Sold — beverages, mixers, garnishes, and any food inventory |
| Licenses & Permits | Expense | Liquor license, health permit, business license renewals |
| Equipment & Maintenance | Expense | Glassware, taps, fridges, repairs |
| Music / Entertainment | Expense | DJ/band fees, licensing (e.g. performance rights) |
| Marketing & Ads | Expense | |
| Software & Subscriptions | Expense | POS system, apps, tools |
| Payment Processing Fees | Expense | Fees your card processor deducts per transaction (e.g. Tranzila, PayPlus, Cardcom) |
| Rent & Utilities | Expense | |
| Payroll | Expense | |
| Taxes | Expense | |
| Professional Services | Expense | Accountant, legal |
| Bank Fees | Expense | |
| Cleaning & Supplies | Expense | Cleaning products, disposables, other consumables |
| Other Expense | Expense | Catch-all |

This tab has two purposes: (1) feeds the dropdown validation on `Transactions!D`, and (2) the AI extraction prompt should be given this exact list so it classifies consistently instead of inventing new category names every time. **The bot reads this tab live at runtime** — it is not hardcoded in code.

## Tab 3: Dashboard (calculated overview — this is what you actually look at)

**Block A — Monthly Summary Table:** Month | Total Income | Total Expenses | Net Cash Flow | Running Balance
- Total Income: `=SUMIFS(Transactions!H:H, Transactions!D:D,"Income", Transactions!B:B,">="&Start, Transactions!B:B,"<="&End)`
- Total Expenses: same with `"Expense"`
- Net Cash Flow: `=Income - Expenses` (this month's result only)
- Running Balance: `=Previous Running Balance + Net Cash Flow` (cumulative across all months)

**Block B — Category Breakdown** (current month, or selectable period): Category | Total (ILS) | % of Total Expenses — via `SUMIFS` per category + `=Category Total / SUM(all expense totals)`.

**Block C — Key Metrics** (single cells, top of dashboard): Current Balance, This Month Net, Avg Monthly Burn (last 3–6 months), Top 3 Expense Categories, Month-over-Month change %.

**Block D — Charts:** Net Cash Flow / Running Balance over time; Expense by Category (pie/bar); Income vs Expense per month (last 6–12 months).

### Why this structure

- `Transactions` stays a pure append-only log — the bot only ever adds rows, never reads/recalculates the sheet, which keeps the coding agent's job simple and avoids race conditions.
- All math lives in `Dashboard`, computed from `Transactions` via formulas — re-categorizing or fixing a past transaction updates every summary automatically.
- `Categories` decouples "what categories exist" from "code logic" — add/rename a category in the sheet without touching the bot's code, as long as extraction reads this tab's list on each run.

### Why income and expenses share one tab (not split into two)

Keep everything in a single `Transactions` tab with the `Type` column doing the separation. Reasons: (1) running balance and month-over-month views need income and expenses interleaved chronologically; (2) the bot only needs one place to append a row — simpler, less error-prone write path; (3) fully separated views are still available on demand via Filter Views or the Dashboard's breakdown; (4) two tabs = two places a transaction could land, raising double-counting risk.

### Design principle: raw data is never summarized away

`Transactions` is permanent and append-only — every confirmed income or expense gets its own row, forever. `Dashboard` only reads from it via formulas; it never overwrites or replaces transaction-level detail. The bot always writes one row per event, never a pre-aggregated summary row — including for Z-reports.

### Z-Reports for daily bar income

A Z-report is one row per day in `Transactions`, not a separate summary mechanism.

- Source: `Z-Report`
- Category: `Bar Sales`
- Vendor/Source field: `Z-Report`
- Description: e.g. "Daily Z-report – [date], X transactions"
- Amount: the day's total from the report

**Z-Report is the sole source of income entries.** The email scanner realistically only ever picks up expense-side emails (supplier invoices, utility bills, subscription charges) — a bar doesn't get "order confirmation" emails for its own sales. So there's no meaningful double-counting risk: Bar Sales income comes from Z-reports only, and everything the email scanner finds stays on the expense side.

### Sheet access: admins only

Only admins get view/edit access to the actual Google Sheet — workers never see it. Workers only ever interact through the Telegram bot to submit Z-reports and don't need sheet access to do that. Since workers are already excluded by design, the full sheet (or just the Dashboard tab, if vendor-level detail should stay more restricted) can be shared with admins and the accountant without needing a separate summarized copy.
