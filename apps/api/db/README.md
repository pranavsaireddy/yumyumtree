# apps/api/db

SQL migrations for the YumYumTree database.

## How to apply

Paste each file into the **Supabase SQL Editor** and click **Run**, in order.
The migration runner (`scripts/migrate.js`) does not exist until Session 14A.
All files are idempotent — safe to re-run in order without errors.

| Order | File | Contents |
|---|---|---|
| 1 | `migrations/001_core_tables.sql` | IF NOT EXISTS guards for `customers`, `menu_categories`, `menu_items` (pre-existing); creates `menu_addons`, `tables`, `orders`, `order_items` |
| 2 | `migrations/002_reliability_tables.sql` | `order_events`, `processed_webhooks`, `outbox`, `loyalty_transactions`, `menu_sync_log`, `whatsapp_sessions` |
| 3 | `migrations/003_indexes.sql` | All indexes — including partial UNIQUE on `orders.razorpay_payment_id` and partial active-orders index |
| 4 | `migrations/004_rls_enable.sql` | Row Level Security enabled on every table, zero policies (deny-all for anon/authenticated; service_role bypasses RLS) |
| 5 | `migrations/005_functions.sql` | `confirm_order` and `transition_order` RPCs |

## Manual dashboard steps (after running 001–005)

These cannot be done via SQL; complete them in the Supabase dashboard:

1. **Enable Realtime on `orders`**
   Database → Replication → Tables → toggle on `orders`.

2. **Enable Realtime on `menu_items`**
   Database → Replication → Tables → toggle on `menu_items`.
