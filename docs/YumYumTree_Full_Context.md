# YumYumTree — Complete Project Context v2
> All decisions, architecture, reliability improvements, and current state.
> Updated with full robustness review — idempotency, event logs, state machine, async queue, monitoring.

---

## 1. What is YumYumTree?

A **direct food ordering platform** for a single mandi restaurant in Hyderabad, India.
Replaces Swiggy/Zomato with a custom platform — eliminates their 25–30% commission.

**Three ordering channels:**
- Website (desktop + mobile responsive)
- WhatsApp AI chatbot (Phase 3)
- QR code dine-in (one unique QR per table)

**Owner:** Restaurant owner (client) — single branch, Hyderabad
**Developers:** Pranav Sai Reddy (backend lead) · Anudeep (frontend lead)
**Pranav:** m.pranavsaireddy235@gmail.com · 7330801909

---

## 2. Restaurant Details

| Parameter | Detail |
|---|---|
| Type | Mandi restaurant, Hyderabad |
| Tables | ~18 (14–15 dine-in + 3 outdoor) |
| Kitchen | Single |
| Menu | ~80 items |
| POS | PetPooja (billing + KOT — already live) |
| Target scale | 300–400 orders/day |
| Delivery radius | 10 km |

---

## 3. Final Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Zustand | ₹0 (Vercel free) |
| Backend | Node.js + Express on Railway | ₹850/mo |
| Database | Supabase PostgreSQL + Auth + Realtime | ₹0 (free tier) |
| Job Queue | **pg-boss** (runs inside Supabase PostgreSQL) | ₹0 (no new infra) |
| Payments | Razorpay | 2% per transaction |
| Delivery | Shadowfax | ₹35–65/delivery (pass-through) |
| POS | PetPooja API | ~₹1,500–3,000/yr |
| WhatsApp | Meta Cloud API direct | ₹0 (1,000 conversations/mo free) |
| Monitoring | Sentry (free tier) | ₹0 |
| Uptime | UptimeRobot (free) | ₹0 |
| Domain | yumyumtree.in | ~₹500/yr |

**Monthly production cost: ~₹892/month fixed + Razorpay 2% variable**

---

## 4. Architecture Philosophy

> External systems (PetPooja, Shadowfax, WhatsApp, Razorpay) are assumed to be unreliable.
> The restaurant must keep serving food even when every third-party API is down.

**Core principles:**
1. Webhook is truth — UI callbacks are decoration only
2. Every side effect goes through the async queue (pg-boss)
3. Idempotency by database constraint, not by code
4. Every external partner has a manual fallback
5. Prices are always computed server-side — never trust the client
6. Invalid order state transitions are rejected at the DB level
7. Reconciliation jobs are the immune system — never disable them

---

## 5. Monorepo Structure

```
yumyumtree/                   ← github.com/pranavsaireddy/yumyumtree
  apps/
    web/                      ← Next.js frontend (Anudeep) — localhost:3000
    api/                      ← Express backend (Pranav) — localhost:4000
  packages/
    types/                    ← Shared TypeScript interfaces
    utils/                    ← Shared helpers
  .gitignore
  .env.example
```

### Backend structure (apps/api/src/)
```
routes/
  menu.js             ← GET /api/menu
  orders.js           ← POST /api/orders, GET /api/orders/:id
  payments.js         ← POST /payments/webhook (Razorpay)
  delivery.js         ← POST /delivery/webhook (Shadowfax)
  whatsapp.js         ← GET+POST /whatsapp/webhook
  admin.js            ← orders, revenue, customers, retry controls
services/
  petpooja.js         ← getMenu(), pushOrder()
  shadowfax.js        ← createDelivery(), trackDelivery()
  razorpay.js         ← createOrder(), verifyWebhook(), createPaymentLink()
  whatsappBot.js      ← state machine + Claude NLU
  loyalty.js          ← awardPoints(), redeemPoints()
  notifications.js    ← sendConfirmation(), sendStatusUpdate()
  orderStateMachine.js ← assertTransition(), transition()  ← NEW
queue/
  workers.js          ← pg-boss worker registrations        ← NEW
  jobs/
    pushKot.js        ← PetPooja KOT with retries
    dispatchDelivery.js ← Shadowfax with fallback
    sendNotification.js ← customer alerts
    awardLoyalty.js   ← idempotent ledger write
    reconcilePayments.js ← orphan payment sweep
cron/
  menuSync.js         ← node-cron every 15 min
  expireOrders.js     ← sweep PENDING > 30 min → EXPIRED
middleware/
  auth.js
  adminAuth.js
  rawBody.js          ← CRITICAL: mount before JSON parser on webhook routes
app.js
server.js
```

---

## 6. Database Schema — Full (with Reliability Additions)

### customers
```sql
CREATE TABLE customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone          text UNIQUE,
  email          text,
  name           text,
  google_id      text,
  loyalty_points int DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);
```

### menu_categories
```sql
CREATE TABLE menu_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  petpooja_id  text UNIQUE,
  name         text NOT NULL,
  sort_order   int DEFAULT 0,
  is_active    bool DEFAULT true
);
```

### menu_items
```sql
CREATE TABLE menu_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  petpooja_id  text UNIQUE,
  category_id  uuid REFERENCES menu_categories(id),
  name         text NOT NULL,
  description  text,
  price        numeric NOT NULL,
  is_veg       bool DEFAULT false,
  is_available bool DEFAULT true,
  image_url    text,
  sort_order   int DEFAULT 0
);
```

### menu_addons ⚠️ MANUAL ONLY — PetPooja does not sync these
```sql
CREATE TABLE menu_addons (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id  uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  name     text NOT NULL,
  price    numeric NOT NULL
);
```

### tables (dine-in QR)
```sql
CREATE TABLE tables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number int UNIQUE NOT NULL,
  label        text,
  qr_token     text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text
);
```

### orders ← idempotency_key added
```sql
CREATE TABLE orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key     text UNIQUE NOT NULL,  -- client-generated UUID per checkout attempt
  customer_id         uuid REFERENCES customers(id),
  table_id            uuid REFERENCES tables(id),
  channel             text CHECK (channel IN ('web','qr','whatsapp')) NOT NULL,
  order_type          text CHECK (order_type IN ('delivery','dine_in')) NOT NULL,
  status              text CHECK (status IN (
                        'pending_payment','placed','confirmed',
                        'preparing','ready','dispatched',
                        'delivered','served','cancelled',
                        'rejected','payment_failed','expired'
                      )) NOT NULL DEFAULT 'pending_payment',
  subtotal            numeric NOT NULL,
  discount            numeric DEFAULT 0,
  total               numeric NOT NULL,
  razorpay_order_id   text UNIQUE,
  razorpay_payment_id text UNIQUE,           -- UNIQUE = idempotency by constraint
  shadowfax_order_id  text,
  petpooja_order_id   text,
  delivery_address    jsonb,
  scheduled_at        timestamptz,
  placed_at           timestamptz,
  created_at          timestamptz DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX orders_idempotency_key_idx ON orders(idempotency_key);
CREATE UNIQUE INDEX orders_razorpay_payment_id_idx ON orders(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX orders_status_placed_at_idx ON orders(status, placed_at DESC)
  WHERE status NOT IN ('delivered','served','cancelled','rejected','expired');
CREATE INDEX orders_customer_id_idx ON orders(customer_id, placed_at DESC);
```

### order_items ← price snapshot (never join live prices into historical orders)
```sql
CREATE TABLE order_items (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  item_id  uuid REFERENCES menu_items(id),
  name     text NOT NULL,      -- snapshot
  price    numeric NOT NULL,   -- snapshot
  quantity int NOT NULL,
  addons   jsonb DEFAULT '[]'
);
```

### order_events ← NEW: append-only audit log
```sql
CREATE TABLE order_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid REFERENCES orders(id) ON DELETE CASCADE,
  event      text NOT NULL,
  actor      text DEFAULT 'system',  -- 'system' | 'customer' | 'staff' | 'admin'
  payload    jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Example rows:
-- order_id | event                | actor    | payload
-- abc123   | payment_confirmed    | system   | { razorpay_payment_id: "pay_xyz" }
-- abc123   | kot_sent             | system   | { petpooja_order_id: "pp_123" }
-- abc123   | kot_failed           | system   | { error: "timeout", attempt: 1 }
-- abc123   | rider_assigned       | system   | { rider_name: "Ravi", phone: "9..." }
-- abc123   | status_changed       | staff    | { from: "confirmed", to: "preparing" }
-- abc123   | manually_refunded    | admin    | { reason: "customer request", amount: 320 }

CREATE INDEX order_events_order_id_idx ON order_events(order_id, created_at);
```

### processed_webhooks ← NEW: idempotency for webhook deduplication
```sql
CREATE TABLE processed_webhooks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text NOT NULL,    -- 'razorpay' | 'shadowfax' | 'petpooja'
  event_id     text NOT NULL,    -- razorpay_payment_id or Shadowfax task ID etc.
  event_type   text NOT NULL,    -- 'payment.captured' | 'rider_assigned' etc.
  raw_payload  jsonb NOT NULL,
  processed_at timestamptz DEFAULT now(),
  UNIQUE(source, event_id, event_type)  -- prevents double-processing
);
```

### outbox ← NEW: transactional outbox for side effects
```sql
CREATE TABLE outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate    text NOT NULL,     -- 'order'
  aggregate_id uuid NOT NULL,     -- order.id
  event_type   text NOT NULL,     -- 'order.placed' | 'order.ready' etc.
  payload      jsonb NOT NULL,
  created_at   timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX outbox_unprocessed_idx ON outbox(created_at)
  WHERE processed_at IS NULL;
```

### loyalty_transactions
```sql
CREATE TABLE loyalty_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid REFERENCES customers(id),
  order_id        uuid REFERENCES orders(id) UNIQUE,  -- UNIQUE = idempotent
  points_earned   int DEFAULT 0,
  points_redeemed int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);
```

### menu_sync_log
```sql
CREATE TABLE menu_sync_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at     timestamptz DEFAULT now(),
  items_updated int,
  status        text,
  error         text
);
```

### whatsapp_sessions
```sql
CREATE TABLE whatsapp_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text UNIQUE,
  state        text DEFAULT 'idle',
  order_draft  jsonb DEFAULT '{}',
  updated_at   timestamptz DEFAULT now()
);
```

**Supabase Realtime:** Enable on `orders` and `menu_items` tables only.

---

## 7. Order State Machine ← NEW

All status transitions are **whitelisted**. Any unlisted transition throws an error.

```javascript
// services/orderStateMachine.js

const VALID_TRANSITIONS = {
  pending_payment: ['placed', 'payment_failed', 'expired'],
  placed:          ['confirmed', 'rejected', 'cancelled'],
  confirmed:       ['preparing', 'cancelled'],
  preparing:       ['ready'],
  ready:           ['dispatched', 'served'],   // dispatched=delivery, served=dine-in
  dispatched:      ['delivered', 'cancelled'],
  // Terminal states — no further transitions allowed
  delivered:       [],
  served:          [],
  cancelled:       [],
  rejected:        [],
  payment_failed:  [],
  expired:         [],
};

function assertTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid transition: ${from} → ${to}`);
  }
}

// Call this in a DB transaction — transition + event log in one atomic operation
async function transition(supabase, orderId, to, actor = 'system', payload = {}) {
  const { data: order } = await supabase
    .from('orders').select('status').eq('id', orderId).single();

  assertTransition(order.status, to);

  const { error } = await supabase.rpc('transition_order', {
    p_order_id: orderId,
    p_new_status: to,
    p_event: `status_changed`,
    p_actor: actor,
    p_payload: { from: order.status, to, ...payload }
  });

  if (error) throw error;
}
```

**Blocked transitions (examples):**
- `delivered → preparing` ❌
- `cancelled → dispatched` ❌
- `served → dispatched` ❌
- `preparing → placed` ❌

---

## 8. Idempotency Strategy ← NEW

### Problem
Razorpay webhooks are delivered **at least once** — the same `payment.captured` event can arrive multiple times (network retries, Razorpay retries).

### Solution: Three layers

**Layer 1 — Database unique constraint**
```sql
UNIQUE(razorpay_payment_id)  -- on orders table
```
If the same payment ID arrives twice, the second DB write fails silently. No duplicate order.

**Layer 2 — processed_webhooks table**
```javascript
// In webhook handler — check before processing
const { data: existing } = await supabase
  .from('processed_webhooks')
  .select('id')
  .eq('source', 'razorpay')
  .eq('event_id', payload.payload.payment.entity.id)
  .eq('event_type', event)
  .maybeSingle();

if (existing) {
  return res.status(200).json({ status: 'already_processed' });
}
```

**Layer 3 — Client idempotency key on order creation**
```javascript
// Frontend generates a UUID per checkout session
// Resends same key on network retry → backend returns original order
const idempotencyKey = crypto.randomUUID();

// Backend: INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING *
```

**Rule:** Mount `express.raw()` on webhook routes **BEFORE** `express.json()`.
This is the #1 webhook bug — signature verification requires the raw body.

```javascript
// app.js — CORRECT order
app.use('/payments/webhook', express.raw({ type: 'application/json' }), paymentsRouter);
app.use('/delivery/webhook', express.raw({ type: 'application/json' }), deliveryRouter);
app.use(express.json()); // global JSON parser — comes AFTER webhook routes
```

---

## 9. Async Queue with pg-boss ← NEW

### Why pg-boss over Redis/BullMQ
- You already pay for Supabase PostgreSQL — zero new infrastructure
- A job can be enqueued in the **same DB transaction** as the order write
- This kills the "payment succeeded but KOT never sent" class of bugs entirely
- Move to Redis/BullMQ only when you exceed ~50 jobs/second (100x current scale)

### Install
```bash
cd apps/api
npm install pg-boss
```

### Setup (queue/workers.js)
```javascript
const PgBoss = require('pg-boss');

const boss = new PgBoss(process.env.DATABASE_URL);

boss.on('error', error => console.error('pg-boss error:', error));

// Register all workers
async function startWorkers() {
  await boss.start();

  // PetPooja KOT push — 5 retries, exponential backoff
  await boss.work('pos.pushKot', { retryLimit: 5, retryBackoff: true }, async job => {
    await require('./jobs/pushKot')(job.data);
  });

  // Shadowfax delivery dispatch — 3 retries, fallback to manual
  await boss.work('delivery.dispatch', { retryLimit: 3, retryBackoff: true }, async job => {
    await require('./jobs/dispatchDelivery')(job.data);
  });

  // Customer notifications
  await boss.work('notify.statusChanged', { retryLimit: 3 }, async job => {
    await require('./jobs/sendNotification')(job.data);
  });

  // Loyalty points — idempotent, run after delivered/served
  await boss.work('loyalty.award', { retryLimit: 3 }, async job => {
    await require('./jobs/awardLoyalty')(job.data);
  });

  // Payment reconciliation — runs every 15 min via cron
  await boss.schedule('payment.reconcile', '*/15 * * * *', {});

  console.log('pg-boss workers started');
}

module.exports = { boss, startWorkers };
```

### Enqueue jobs after payment confirmed (in webhook handler)
```javascript
// After updating order status to 'placed' in DB transaction:
await boss.send('pos.pushKot',         { orderId, orderData });
await boss.send('notify.statusChanged', { orderId, status: 'placed', customerId });
if (order.order_type === 'delivery') {
  await boss.send('delivery.dispatch', { orderId });
}
```

### Dead-letter queue (failed jobs)
Jobs that exhaust all retries land in `pgboss.archive` with status `failed`.
Surface these on the admin System Health card with a Retry button.

---

## 10. Outbox Pattern for Side Effects ← NEW

The outbox ensures every side effect fires **at least once** even if the process crashes mid-request.

**Write order + outbox in one transaction:**
```javascript
// In payments webhook handler — one atomic DB transaction
await supabase.rpc('confirm_order', {
  p_order_id: orderId,
  p_payment_id: paymentId,
  // This RPC internally:
  // 1. Updates orders.status = 'placed', stores razorpay_payment_id
  // 2. Inserts into order_events
  // 3. Inserts into outbox { event_type: 'order.placed', aggregate_id: orderId }
  // All in one transaction — either all succeed or all fail
});
```

**Outbox drain worker (runs every 2 seconds):**
```javascript
// Picks up unprocessed outbox rows and fans out to pg-boss jobs
const pendingEvents = await supabase
  .from('outbox')
  .select('*')
  .is('processed_at', null)
  .limit(50);

for (const event of pendingEvents) {
  await boss.send(event.event_type, event.payload);
  await supabase.from('outbox')
    .update({ processed_at: new Date() })
    .eq('id', event.id);
}
```

---

## 11. Environment Variables

### apps/api/.env (backend)
```
PORT=4000
FRONTEND_URL=http://localhost:3000
DATABASE_URL=                         # full Supabase connection string (for pg-boss)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
PETPOOJA_API_KEY=
PETPOOJA_API_SECRET=
PETPOOJA_APP_KEY=
PETPOOJA_RESTAURANT_ID=
SHADOWFAX_CLIENT_CODE=
SHADOWFAX_API_KEY=
SHADOWFAX_PICKUP_LAT=
SHADOWFAX_PICKUP_LNG=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
SENTRY_DSN=
```

### apps/web/.env.local (frontend)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_RAZORPAY_KEY_ID=
```

---

## 12. API Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | /health | Public | Health check |
| GET | /api/menu | Public | Full menu (categories + items) |
| GET | /api/restaurant/status | Public | Open/closed status |
| GET | /api/tables/verify | Public | Verify QR token → table_number |
| POST | /api/orders | JWT | Create order + Razorpay order (idempotency key required) |
| GET | /api/orders/:id | JWT | Order + status |
| POST | /api/orders/:id/cancel | JWT | Cancel (only before preparing) |
| GET | /api/loyalty/:customerId | JWT | Points balance + history |
| POST | /api/loyalty/redeem | JWT | Apply points discount to order |
| POST | /payments/webhook | Razorpay sig | Confirm payment → trigger pipeline |
| POST | /delivery/webhook | Shadowfax | Delivery status updates |
| GET | /admin/orders | Admin JWT | Paginated orders with filters |
| GET | /admin/revenue | Admin JWT | Revenue stats |
| GET | /admin/customers | Admin JWT | Customer list |
| POST | /admin/orders/:id/retry-kot | Admin JWT | Manually retry PetPooja push ← NEW |
| POST | /admin/orders/:id/retry-delivery | Admin JWT | Manually retry Shadowfax ← NEW |
| POST | /admin/orders/:id/transition | Admin JWT | Force status transition (with reason) ← NEW |
| GET | /admin/system-health | Admin JWT | DLQ depth, last sync, webhook failures ← NEW |
| GET | /whatsapp/webhook | Public | Meta verification |
| POST | /whatsapp/webhook | Public | Receive WhatsApp messages |

---

## 13. Full Order Flow (with reliability)

```
1.  Customer submits cart with idempotency_key (UUID generated by frontend)
        ↓
2.  POST /api/orders
    → Server validates items + prices from DB (never trust client prices)
    → INSERT orders (status=pending_payment, idempotency_key stored)
    → ON CONFLICT (idempotency_key) DO NOTHING → return existing order (safe retry)
    → Create Razorpay order → return { razorpay_order_id, amount }
        ↓
3.  Frontend opens Razorpay Checkout (hosted — card data never touches our servers)
        ↓
4.  Customer pays → Razorpay calls POST /payments/webhook
        ↓
5.  Backend webhook handler:
    a. Verify HMAC signature on RAW body (before JSON parsing)
    b. Check processed_webhooks table → if exists, return 200 immediately
    c. Verify webhook amount == order total (mismatch → flag, do NOT place)
    d. In one DB transaction:
       - INSERT processed_webhooks (source, event_id, event_type)
       - UPDATE orders SET status='placed', razorpay_payment_id=... (UNIQUE constraint)
       - INSERT order_events (payment_confirmed)
       - INSERT outbox rows (order.placed)
    e. Return 200 immediately (< 2s)
        ↓
6.  Outbox drain → pg-boss enqueues:
    - pos.pushKot         (5 retries, exp backoff)
    - notify.statusChanged
    - delivery.dispatch   (if delivery order)
        ↓
7.  Supabase Realtime fires → customer tracking page updates automatically
        ↓
8.  pos.pushKot job:
    → Call PetPooja sendOrder → KOT prints in kitchen
    → On success: INSERT order_events (kot_sent)
    → On all retries failed: INSERT order_events (kot_failed)
                             → DLQ → Admin sees alert "Punch KOT manually"
        ↓
9.  delivery.dispatch job (delivery orders only):
    → Call Shadowfax createDelivery
    → Store shadowfax_order_id on order
    → On all retries failed: → alert admin "Assign rider manually"
        ↓
10. Shadowfax webhooks fire as rider moves:
    → rider_assigned → dispatched
    → delivered → transition order to delivered
    → INSERT order_events on each update
        ↓
11. loyalty.award job fires after delivered/served:
    → INSERT loyalty_transactions ON CONFLICT (order_id) DO NOTHING (idempotent)
    → UPDATE customers SET loyalty_points = loyalty_points + earned
        ↓
12. payment.reconcile cron (every 15 min):
    → Fetch recent Razorpay payments
    → Find any captured payment without a placed order → auto-refund + alert
    → This catches "payment succeeded but webhook was lost"
```

---

## 14. Manual Fallbacks

Every external partner has a fallback so the restaurant never stops serving:

| Partner down | Fallback behaviour |
|---|---|
| PetPooja | Job → DLQ → admin sees "Punch KOT manually" alert on dashboard |
| Shadowfax | After 3 retries → "Assign rider manually" alert → staff uses own rider |
| Razorpay | Ordering blocked (prepaid only — acceptable). Reconcile catches missed webhooks |
| Supabase Realtime | Frontend falls back to polling GET /api/orders/:id every 15s |
| WhatsApp | Orders still work on website — WhatsApp is Phase 3 |

---

## 15. Monitoring ← NEW

### Sentry (free tier — install on both frontend and backend)
```bash
# Backend
npm install @sentry/node

# Frontend
npm install @sentry/nextjs
```

Capture:
- Unhandled exceptions
- Webhook signature failures (alert immediately — could be attack)
- Payment amount mismatches
- State machine illegal transitions
- All DLQ entries

### UptimeRobot (free)
Monitor these endpoints:
- `GET /health` — process alive
- `GET /readyz` — DB ping + outbox depth + last webhook age

### The four alerts that page you immediately
1. Webhook signature verification failure spike → possible attack
2. DLQ non-empty for > 5 minutes during open hours → KOT not reaching kitchen
3. `/readyz` failing → full outage
4. Orphan payment detected → customer charged but no order

### Admin System Health card
Surface on the admin dashboard:
- Outbox/DLQ depth (how many jobs are stuck)
- Last PetPooja sync timestamp
- Webhook failure count (last hour)
- Failed job list with one-click Retry button

---

## 16. Admin Retry Controls ← NEW

The admin dashboard needs operational tooling for real-world kitchen incidents:

```javascript
// POST /admin/orders/:id/retry-kot
router.post('/:id/retry-kot', adminAuth, async (req, res) => {
  const { id } = req.params;
  await boss.send('pos.pushKot', { orderId: id, isRetry: true });
  await supabase.from('order_events').insert({
    order_id: id, event: 'kot_retry_triggered', actor: 'admin'
  });
  res.json({ queued: true });
});

// POST /admin/orders/:id/retry-delivery
router.post('/:id/retry-delivery', adminAuth, async (req, res) => {
  await boss.send('delivery.dispatch', { orderId: req.params.id, isRetry: true });
  res.json({ queued: true });
});

// POST /admin/orders/:id/transition
// Force a status change with a reason — useful for edge cases
router.post('/:id/transition', adminAuth, async (req, res) => {
  const { to, reason } = req.body;
  await orderStateMachine.transition(supabase, req.params.id, to, 'admin', { reason });
  res.json({ ok: true });
});
```

---

## 17. PetPooja Integration

**Keys needed:** app-key, access-token, app-secret, restaurant-id (all from PetPooja)

**Auth headers on every request:**
```
app-key:      PETPOOJA_APP_KEY
access-token: PETPOOJA_API_KEY
Content-Type: application/json
```

**Endpoints:**

| Endpoint | Purpose | Trigger |
|---|---|---|
| GET /getItems | All menu items | Cron every 15 min |
| GET /getCategory | All categories | Cron every 15 min |
| GET /getItemVariations | Size variants | Cron every 15 min |
| GET /getTaxes | GST slabs | Cron every 15 min |
| GET /restaurantOpenClose | Open/closed | /api/restaurant/status |
| POST /sendOrder | Delivery KOT | After payment confirmed (via pg-boss job) |
| POST /sendDineInOrder | Dine-in KOT | After QR order placed (via pg-boss job) |

**⚠️ Known limitation:** PetPooja API does NOT sync add-ons.
The `menu_addons` table must be managed manually in Supabase.

**⚠️ Never block order confirmation on PetPooja failure.**
KOT push is async via pg-boss. If all retries fail → DLQ → admin alert.

**Status:** API access request emailed to support@petpooja.com. Awaiting credentials.

---

## 18. WhatsApp Bot State Machine

```
idle → greeting_sent → browsing_menu → item_selected →
address_collection → payment_link_sent → order_confirmed
```

- State stored in `whatsapp_sessions` table
- Razorpay **payment links** (not checkout) for WhatsApp orders
- On payment → same webhook pipeline as website orders
- Claude API for NLU: free-text → structured intent
- Claude never owns money or state transitions — it only parses intent

---

## 19. Frontend Pages (Anudeep)

| Page | Route | Key notes |
|---|---|---|
| Menu | / | Category tabs, item cards, cart drawer, open/closed banner |
| Auth | /login | Supabase OTP + Google |
| Cart + Checkout | /cart | Loyalty redemption, address, schedule, Razorpay |
| Order tracking | /track/[orderId] | Supabase Realtime + polling fallback |
| QR Dine-in | /dine | Reads ?table=TOKEN, locks to dine_in |
| Profile + Loyalty | /profile | Points balance, order history |
| Admin Dashboard | /admin | Orders, revenue charts, customers, system health |

**Cart state:** Zustand (persisted to localStorage, versioned)
**Mock backend:** json-server on port 4000 during frontend-only development
**Swap to real:** change `NEXT_PUBLIC_BACKEND_URL` only — nothing else changes

---

## 20. Business Rules

- No COD — all delivery orders prepaid
- Same-day scheduling only
- 10 km delivery radius — enforced server-side (not just frontend)
- Loyalty: 1 point per ₹100 spent, ₹1 discount per point redeemed
- Add-ons not from PetPooja — manage manually in `menu_addons`
- QR URL format: `/dine?table={qr_token}`
- Admin is owner-only for now
- WhatsApp free tier: 1,000 conversations/month
- Session duration: 60 days

---

## 21. Build Order (Correct Sequence)

> Do NOT build everything at once. Each phase is a stable foundation for the next.

| # | What | Why this order |
|---|---|---|
| 1 | Menu + Cart (frontend + API) | Simplest. Establishes data flow. Anudeep can start here. |
| 2 | Razorpay payment flow | Critical foundation everything else depends on |
| 3 | Order tracking (Realtime) | Proves the full loop works end to end |
| 4 | PetPooja KOT push | External API — most unpredictable. Integrate after core is stable. |
| 5 | Shadowfax dispatch | Second external API. Add after PetPooja is working. |
| 6 | QR Dine-in | Easy once the ordering pipeline is solid |
| 7 | Admin Dashboard | Operational tooling — build when you have real orders to look at |
| 8 | WhatsApp chatbot | Phase 3. Reuses entire order pipeline. |

---

## 22. Current Status

### ✅ Done
- GitHub repo: `github.com/pranavsaireddy/yumyumtree`
- Monorepo: `apps/web` (Next.js) + `apps/api` (Express)
- Both servers running locally (3000 + 4000)
- Supabase project created, Mumbai region
- First 3 DB tables created: `customers`, `menu_categories`, `menu_items`
- `git config core.autocrlf true` set (Windows CRLF fix)
- Initial commit pushed to `main`

### ⏳ Pending (external)
- PetPooja API access — emailed, awaiting response
- Razorpay account — to be created
- Shadowfax onboarding — to be started
- WhatsApp Business API — Facebook Business Manager to be created

### 🔜 Next task
**Menu API — first real feature:**
1. Create `apps/api/src/routes/menu.js` — GET /api/menu
2. Create `apps/api/src/services/petpooja.js` with mock fallback
3. Add mock mandi menu JSON (categories + ~80 items)
4. Wire route into app.js
5. Test at `http://localhost:4000/api/menu`
6. Give Anudeep the endpoint to build the menu page against

---

## 23. Documents Produced

| Document | Purpose |
|---|---|
| `YumYumTree_Budget_Report_v2.pdf` | Full service comparison + cost at 300-400 orders/day |
| `YumYumTree_Info_Collection_Form.docx` | Collect all credentials from owner |
| `YumYumTree_Master_Workflow.docx` | Pranav's complete build guide |
| `Anudeep_Frontend_Tasks.docx` | Anudeep's frontend task list |
| `claude.md` | Claude Code context file |
| `YumYumTree_Full_Context.md` | This file — master reference |

---

## 24. Key Contacts

| Who | Detail |
|---|---|
| Pranav (backend dev) | m.pranavsaireddy235@gmail.com · 7330801909 |
| PetPooja support | support@petpooja.com · +91 7969223344 |

---

## 25. Critical Gotchas

1. **express.raw() must be mounted BEFORE express.json() on webhook routes** — #1 webhook bug
2. **PetPooja API does not sync add-ons** — manual `menu_addons` table only
3. **Razorpay Key Secret shown only once** — store in password manager immediately
4. **WhatsApp number must NOT be on any existing WhatsApp account** — new SIM required
5. **Never put SUPABASE_SERVICE_ROLE_KEY in frontend** — backend only
6. **Never hardcode URLs** — always via `NEXT_PUBLIC_BACKEND_URL` env var
7. **Supabase free tier pauses after 7 days inactivity** — add /health ping cron before going live
8. **Razorpay webhooks arrive at-least-once** — idempotency by UNIQUE constraint is mandatory
9. **PetPooja Apiary docs require JavaScript** — read in browser, cannot be fetched programmatically
10. **Do not go live on a Friday/Saturday evening** — go live Tuesday or Wednesday morning

---

*v2 — updated with idempotency, pg-boss queue, outbox pattern, order_events, state machine, admin retry controls, monitoring*

---

## 26. Transaction Boundaries ← NEW

> Rule: anything that touches more than one table must run inside a PostgreSQL function (RPC).
> The Supabase JS client cannot do multi-statement transactions directly.

### Operations that MUST be atomic

| Operation | Tables touched | RPC name |
|---|---|---|
| Payment confirmed | orders + order_events + outbox + processed_webhooks | `confirm_order` |
| Order placed (post-payment) | orders + order_items + outbox | `place_order` |
| Loyalty redemption | orders + loyalty_transactions + customers | `redeem_loyalty` |
| Loyalty award | loyalty_transactions + customers | `award_loyalty` |
| Order status transition | orders + order_events | `transition_order` |
| Admin force transition | orders + order_events + outbox | `admin_transition_order` |

### Example RPC — confirm_order
```sql
CREATE OR REPLACE FUNCTION confirm_order(
  p_order_id        uuid,
  p_payment_id      text,
  p_webhook_source  text,
  p_webhook_event   text,
  p_raw_payload     jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Guard: idempotency check
  IF EXISTS (
    SELECT 1 FROM processed_webhooks
    WHERE source = p_webhook_source
      AND event_id = p_payment_id
      AND event_type = p_webhook_event
  ) THEN
    RETURN; -- already processed, do nothing
  END IF;

  -- 2. Insert webhook dedup record
  INSERT INTO processed_webhooks(source, event_id, event_type, raw_payload)
  VALUES (p_webhook_source, p_payment_id, p_webhook_event, p_raw_payload);

  -- 3. Update order
  UPDATE orders
  SET status = 'placed',
      razorpay_payment_id = p_payment_id,
      placed_at = now()
  WHERE id = p_order_id
    AND status = 'pending_payment';  -- guard against double-fire

  -- 4. Append event log
  INSERT INTO order_events(order_id, event, actor, payload)
  VALUES (p_order_id, 'payment_confirmed', 'system',
          jsonb_build_object('razorpay_payment_id', p_payment_id));

  -- 5. Write outbox for downstream jobs
  INSERT INTO outbox(aggregate, aggregate_id, event_type, payload)
  VALUES
    ('order', p_order_id, 'order.placed',
     jsonb_build_object('orderId', p_order_id));

END;
$$;
```

### Example RPC — transition_order
```sql
CREATE OR REPLACE FUNCTION transition_order(
  p_order_id    uuid,
  p_new_status  text,
  p_event       text,
  p_actor       text,
  p_payload     jsonb DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current text;
BEGIN
  SELECT status INTO v_current FROM orders WHERE id = p_order_id FOR UPDATE;

  -- State machine enforcement at DB level — catches any bypass attempt
  IF NOT (
    (v_current = 'pending_payment' AND p_new_status IN ('placed','payment_failed','expired')) OR
    (v_current = 'placed'          AND p_new_status IN ('confirmed','rejected','cancelled')) OR
    (v_current = 'confirmed'       AND p_new_status IN ('preparing','cancelled')) OR
    (v_current = 'preparing'       AND p_new_status = 'ready') OR
    (v_current = 'ready'           AND p_new_status IN ('dispatched','served')) OR
    (v_current = 'dispatched'      AND p_new_status IN ('delivered','cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid transition: % → %', v_current, p_new_status;
  END IF;

  UPDATE orders SET status = p_new_status WHERE id = p_order_id;

  INSERT INTO order_events(order_id, event, actor, payload)
  VALUES (p_order_id, p_event, p_actor,
          p_payload || jsonb_build_object('from', v_current, 'to', p_new_status));
END;
$$;
```

**Isolation level:** All RPCs run at the default PostgreSQL `READ COMMITTED`.
For payment confirmation specifically, the `FOR UPDATE` lock on the order row prevents concurrent double-processing.

---

## 27. Validation Layer (Zod) ← NEW

### Install (both apps)
```bash
# In apps/api/
npm install zod

# In apps/web/ (reuse same schemas from packages/types)
# Already available if using monorepo packages/types
```

### Shared schemas (packages/types/src/schemas.ts)
```typescript
import { z } from 'zod';

export const OrderItemSchema = z.object({
  item_id:  z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  addons:   z.array(z.object({
    addon_id: z.string().uuid(),
    name:     z.string().max(100),
    price:    z.number().nonnegative(),
  })).max(10).default([]),
});

export const CreateOrderSchema = z.object({
  idempotency_key:  z.string().uuid(),
  items:            z.array(OrderItemSchema).min(1).max(50),
  order_type:       z.enum(['delivery', 'dine_in']),
  table_id:         z.string().uuid().optional(),
  delivery_address: z.object({
    line1:    z.string().min(5).max(200),
    city:     z.string().min(2).max(100),
    pincode:  z.string().regex(/^\d{6}$/),
    lat:      z.number().min(17).max(18),   // Hyderabad bounding box
    lng:      z.number().min(78).max(79),
  }).optional(),
  scheduled_at: z.string().datetime().optional()
    .refine(val => {
      if (!val) return true;
      const d = new Date(val);
      const now = new Date();
      const endOfDay = new Date(); endOfDay.setHours(23, 59, 59);
      return d > now && d <= endOfDay;  // same-day only
    }, { message: 'Scheduled time must be later today' }),
  loyalty_points_to_redeem: z.number().int().min(0).default(0),
}).refine(data => {
  if (data.order_type === 'delivery' && !data.delivery_address)
    return false;
  if (data.order_type === 'dine_in' && !data.table_id)
    return false;
  return true;
}, { message: 'Missing address for delivery or table_id for dine-in' });

export const RedeemLoyaltySchema = z.object({
  order_id: z.string().uuid(),
  points:   z.number().int().min(1),
});

export const AdminTransitionSchema = z.object({
  to:     z.enum(['confirmed','preparing','ready','dispatched','delivered','served','cancelled','rejected']),
  reason: z.string().min(5).max(500),
});
```

### Validation middleware (apps/api/src/middleware/validate.js)
```javascript
const { ZodError } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(422).json({ error: 'Validation failed', errors });
    }
    req.body = result.data;  // replace with parsed + coerced data
    next();
  };
}

module.exports = { validate };
```

### Usage in routes
```javascript
const { validate } = require('../middleware/validate');
const { CreateOrderSchema } = require('@yumyumtree/types');

router.post('/', auth, validate(CreateOrderSchema), async (req, res) => {
  // req.body is now fully validated and typed
  const { items, order_type, delivery_address, idempotency_key } = req.body;
  // ...
});
```

**Critical rule: server always recomputes totals.**
Never use the total from the request body. Always:
```javascript
const total = await computeTotal(items);  // fetch prices from DB, ignore client prices
```

---

## 28. Rate Limiting ← NEW

### Install
```bash
npm install express-rate-limit
```

### Setup (apps/api/src/middleware/rateLimiter.js)
```javascript
const rateLimit = require('express-rate-limit');

// OTP login — strict: 5 attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Order creation — 20 per minute per IP (handles bursts)
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many orders. Slow down.' },
});

// Razorpay webhook — 100 per minute (Razorpay can send bursts on retries)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Webhook rate limit exceeded.' },
});

// WhatsApp webhook — 200 per minute (Meta sends at high frequency)
const whatsappLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
});

// Admin routes — 60 per minute per IP
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Admin rate limit exceeded.' },
});

module.exports = { loginLimiter, orderLimiter, webhookLimiter, whatsappLimiter, adminLimiter };
```

### Mount in app.js
```javascript
const {
  loginLimiter, orderLimiter, webhookLimiter, whatsappLimiter, adminLimiter
} = require('./middleware/rateLimiter');

app.use('/payments/webhook',  express.raw({ type: 'application/json' }), webhookLimiter);
app.use('/delivery/webhook',  express.raw({ type: 'application/json' }));
app.use('/whatsapp/webhook',  whatsappLimiter);
app.use(express.json());

app.use('/api/auth',    loginLimiter);
app.use('/api/orders',  orderLimiter);
app.use('/admin',       adminLimiter);
```

---

## 29. Secret Management ← NEW

### Rules — non-negotiable
- **Never** share `.env` files over WhatsApp, Telegram, or email
- **Never** commit `.env` or `.env.local` — they are in `.gitignore`
- **Never** screenshot Railway/Vercel env panels and share the image
- **Never** hardcode any key, even temporarily, even in a comment

### Current (local dev)
- `.env` and `.env.local` files — only on your local machine
- Share secret values with Anudeep via a **password manager** (Bitwarden free tier is fine)
- Bitwarden allows sharing a single item securely — use this for Supabase anon key

### Production (Railway + Vercel)
- All secrets entered directly in Railway/Vercel dashboard environment variables panel
- **No env file is ever uploaded to these platforms**
- Each developer only sees the secrets they need

### Secret rotation checklist
Rotate immediately if any of these happen:
- [ ] Key accidentally committed to Git (even for 1 second — Git history retains it)
- [ ] Key shared over an insecure channel
- [ ] A developer leaves the project
- [ ] Railway/Vercel account is compromised

### Accidental commit recovery
```bash
# If you accidentally commit a secret:
# 1. Rotate the key IMMEDIATELY (before doing anything else)
# 2. Then clean Git history:
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env' \
  --prune-empty --tag-name-filter cat -- --all
git push origin --force --all
# 3. The key is still in GitHub history until force-push propagates
# This is why rotating first is non-negotiable
```

### Add GitGuardian (free, catches secrets before push)
```bash
pip install detect-secrets
detect-secrets scan > .secrets.baseline
# Add pre-commit hook — blocks commits containing secrets
```

---

## 30. Payment Reconciliation — Safe Mode ← NEW

> Auto-refunding orphan payments is dangerous. A bug in the reconcile logic
> could trigger thousands of refunds. Manual review is the right default.

### Correct reconciliation flow

```javascript
// cron/reconcilePayments.js — runs every 15 minutes

async function reconcilePayments() {
  // Fetch payments from Razorpay captured in last 30 minutes
  const payments = await razorpay.payments.all({
    from: Math.floor((Date.now() - 30 * 60 * 1000) / 1000),
    count: 100,
  });

  for (const payment of payments.items) {
    if (payment.status !== 'captured') continue;

    // Check if we have a placed order for this payment
    const { data: order } = await supabase
      .from('orders')
      .select('id, status')
      .eq('razorpay_payment_id', payment.id)
      .maybeSingle();

    if (order) continue; // Normal case — order exists

    // ORPHAN PAYMENT DETECTED
    // Do NOT auto-refund. Flag for manual review.
    await supabase.from('order_events').insert({
      order_id: null,
      event: 'orphan_payment_detected',
      actor: 'system',
      payload: {
        razorpay_payment_id: payment.id,
        amount: payment.amount / 100,
        customer_email: payment.email,
        detected_at: new Date().toISOString(),
        requires_manual_review: true,
      },
    });

    // Alert admin via Sentry + admin dashboard flag
    Sentry.captureMessage(`Orphan payment: ${payment.id}`, {
      level: 'error',
      extra: { payment },
    });

    // Surface on admin/system-health as an actionable alert
    // Admin manually reviews and decides: refund or correlate with order
  }
}
```

### When to auto-refund (and when not to)

| Situation | Action |
|---|---|
| Payment captured, webhook never arrived, no order | Flag → admin reviews → manual refund if confirmed |
| Payment captured, order exists but status = payment_failed | Fix order status — do NOT refund |
| Duplicate payment_id (should be impossible with UNIQUE constraint) | Log + alert, never auto-refund |
| Payment amount != order total | Hold payment, alert admin immediately |

### Manual refund endpoint (admin only)
```javascript
// POST /admin/payments/:paymentId/refund
router.post('/:paymentId/refund', adminAuth, async (req, res) => {
  const { reason, amount } = req.body;

  // Log the intent first
  await supabase.from('order_events').insert({
    event: 'refund_initiated',
    actor: req.admin.id,
    payload: { paymentId: req.params.paymentId, reason, amount },
  });

  // Then execute
  const refund = await razorpay.payments.refund(req.params.paymentId, {
    amount: amount * 100,  // convert to paise
    notes: { reason, initiated_by: req.admin.email },
  });

  await supabase.from('order_events').insert({
    event: 'refund_completed',
    actor: req.admin.id,
    payload: { refund_id: refund.id, amount },
  });

  res.json({ refund_id: refund.id });
});
```

---

## 31. Testing Strategy ← NEW

### Install (apps/api/)
```bash
npm install -D vitest supertest @vitest/coverage-v8
```

### Test structure
```
apps/api/
  src/
    __tests__/
      unit/
        orderStateMachine.test.js  ← pure logic, no DB
        validation.test.js         ← Zod schema tests
        priceCalculation.test.js   ← total computation
      integration/
        menu.test.js               ← GET /api/menu
        orders.test.js             ← POST /api/orders
        webhook.test.js            ← POST /payments/webhook
      mocks/
        supabase.js                ← mock Supabase client
        razorpay.js                ← mock Razorpay
        petpooja.js                ← mock PetPooja
```

### Most important tests to write first

**1. State machine unit tests (zero external dependencies)**
```javascript
// __tests__/unit/orderStateMachine.test.js
import { describe, it, expect } from 'vitest';
import { assertTransition } from '../../services/orderStateMachine';

describe('Order State Machine', () => {
  it('allows valid transition: placed → confirmed', () => {
    expect(() => assertTransition('placed', 'confirmed')).not.toThrow();
  });

  it('blocks invalid transition: delivered → preparing', () => {
    expect(() => assertTransition('delivered', 'preparing'))
      .toThrow('Invalid transition');
  });

  it('blocks all transitions from terminal states', () => {
    const terminals = ['delivered', 'served', 'cancelled', 'rejected', 'expired'];
    terminals.forEach(state => {
      expect(() => assertTransition(state, 'preparing'))
        .toThrow('Invalid transition');
    });
  });
});
```

**2. Webhook integration test**
```javascript
// __tests__/integration/webhook.test.js
import { describe, it, expect, vi } from 'vitest';
import supertest from 'supertest';
import app from '../../app';
import crypto from 'crypto';

function makeRazorpaySignature(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('POST /payments/webhook', () => {
  it('rejects invalid signature', async () => {
    const res = await supertest(app)
      .post('/payments/webhook')
      .set('x-razorpay-signature', 'bad_signature')
      .send({ event: 'payment.captured' });
    expect(res.status).toBe(400);
  });

  it('returns 200 on duplicate webhook (idempotency)', async () => {
    // first call
    // second identical call
    // both return 200, order state unchanged after second
  });

  it('confirms order on valid payment.captured', async () => {
    // mock Supabase RPC, verify confirm_order was called
  });
});
```

**3. Validation tests**
```javascript
// __tests__/unit/validation.test.js
import { CreateOrderSchema } from '@yumyumtree/types';

describe('CreateOrderSchema', () => {
  it('rejects delivery order without address', () => {
    const result = CreateOrderSchema.safeParse({
      idempotency_key: crypto.randomUUID(),
      items: [{ item_id: crypto.randomUUID(), quantity: 1 }],
      order_type: 'delivery',
      // no delivery_address
    });
    expect(result.success).toBe(false);
  });

  it('rejects scheduled time in the past', () => {
    const result = CreateOrderSchema.safeParse({
      idempotency_key: crypto.randomUUID(),
      items: [{ item_id: crypto.randomUUID(), quantity: 1 }],
      order_type: 'dine_in',
      table_id: crypto.randomUUID(),
      scheduled_at: '2020-01-01T10:00:00Z',  // past
    });
    expect(result.success).toBe(false);
  });
});
```

### package.json test scripts
```json
"scripts": {
  "test":          "vitest run",
  "test:watch":    "vitest",
  "test:coverage": "vitest run --coverage"
}
```

### Staging environment
Before going live, set up a separate Supabase project and Railway service called `yumyumtree-staging`.
Use Razorpay test mode keys on staging.
**Never test with live payment keys against the production database.**

---

## 32. Admin Security ← NEW

### Current auth (Phase 1)
Simple approach: a single admin record in Supabase with a hashed password.
Admin JWT is separate from customer JWT — different signing secret.

```javascript
// middleware/adminAuth.js
const jwt = require('jsonwebtoken');

async function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
}
```

### Admin audit log
Every admin action must be logged — not just order events, but admin sessions too:
```sql
CREATE TABLE admin_audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   text NOT NULL,
  action     text NOT NULL,   -- 'retry_kot' | 'force_transition' | 'refund' etc.
  target_id  uuid,            -- order_id, payment_id etc.
  payload    jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);
```

### TOTP 2FA (Phase 2 — add before going live)
```bash
npm install speakeasy qrcode
```

```javascript
// Admin login flow with TOTP:
// 1. Admin enters password → verified
// 2. Server returns { requires_totp: true }
// 3. Admin enters 6-digit code from authenticator app
// 4. Server verifies: speakeasy.totp.verify({ secret, token })
// 5. On success → issue admin JWT (valid 8 hours)
```

### What admin routes can do — and why this matters
```
POST /admin/orders/:id/retry-kot          → triggers PetPooja KOT
POST /admin/orders/:id/retry-delivery     → triggers Shadowfax dispatch
POST /admin/orders/:id/transition         → changes order state
POST /admin/payments/:id/refund           → issues real money refund
GET  /admin/customers                     → exposes PII (phone, email)
```

**These routes can move money and expose customer data.**
Admin credentials must be treated with the same care as Razorpay keys.

### IP allowlist (optional but recommended for production)
```javascript
const ALLOWED_ADMIN_IPS = (process.env.ADMIN_ALLOWED_IPS || '').split(',');

function adminIpGuard(req, res, next) {
  if (ALLOWED_ADMIN_IPS.length === 0) return next(); // disabled in dev
  const ip = req.ip || req.connection.remoteAddress;
  if (!ALLOWED_ADMIN_IPS.includes(ip)) {
    return res.status(403).json({ error: 'IP not allowed' });
  }
  next();
}
```

---

## 33. Complete Pre-Production Checklist

> Go through every item before switching Railway and Vercel to production env vars.

### Security
- [ ] All `.env` files are in `.gitignore` — verify with `git status`
- [ ] No secrets in Git history — run `git log --all -p | grep -E "(KEY|SECRET|PASSWORD)" `
- [ ] Rate limiting active on login, orders, webhooks, admin routes
- [ ] Zod validation on all POST/PUT request bodies
- [ ] `express.raw()` mounted before `express.json()` on webhook routes
- [ ] Admin 2FA enabled
- [ ] Admin audit log table created and populated on every action
- [ ] SUPABASE_SERVICE_ROLE_KEY not present anywhere in frontend code

### Reliability
- [ ] `confirm_order` RPC deployed and tested in Supabase SQL editor
- [ ] `transition_order` RPC deployed with state machine enforcement
- [ ] `processed_webhooks` table has UNIQUE(source, event_id, event_type)
- [ ] `orders.razorpay_payment_id` has UNIQUE index
- [ ] `orders.idempotency_key` has UNIQUE index
- [ ] pg-boss workers start on server boot (`startWorkers()` called in server.js)
- [ ] Outbox drain loop running (2-second interval)
- [ ] Manual fallback tested: kill PetPooja mock → confirm DLQ alert fires
- [ ] Reconciliation cron tested with a test orphan payment

### Testing
- [ ] State machine unit tests pass: `npm test`
- [ ] Webhook signature rejection test passes
- [ ] Duplicate webhook idempotency test passes
- [ ] Validation rejection tests pass
- [ ] Staging environment tested with real Razorpay test mode payment

### Monitoring
- [ ] Sentry DSN set in both Railway and Vercel env vars
- [ ] UptimeRobot monitoring `/health` and `/readyz`
- [ ] Admin dashboard System Health card showing DLQ depth
- [ ] Test alert: manually insert into `order_events` with `orphan_payment_detected`

### Operations
- [ ] Restaurant owner has tested placing a real order end-to-end
- [ ] KOT prints correctly on first order
- [ ] Owner knows how to use admin dashboard to retry a stuck KOT
- [ ] Shadowfax sandbox test delivery completed successfully
- [ ] Go-live scheduled for Tuesday or Wednesday morning

---

*v3 — updated with transactions, Zod validation, rate limiting, secret management, safe reconciliation, testing strategy, admin security, pre-production checklist*
