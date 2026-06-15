'use strict';

// describe/it/expect/vi/afterEach are globals (vitest.config.js → test.globals).
const request = require('supertest');

const app = require('../../app');
const supabase = require('../../lib/supabase');

// Pure HTTP against the DB-backed menu route with the Supabase service-role client mocked the
// same way orders.test.js / auth.test.js mock it — no real DB, so no assertSafeTestDb fence.
//
// As of S8 GET /api/menu reads menu_categories + menu_items (seeded in S7) so each item carries
// its real uuid `id`. These tests assert the §12 contract over DB rows: both ids exposed,
// price coercion (DB numeric → number), and the route's visibility filtering.

const CAT_MANDI = 'aaaaaaaa-1111-4111-8111-111111111111';
const CAT_DEAD = 'aaaaaaaa-2222-4222-8222-222222222222';

const ITEM_FAHAM = 'bbbbbbbb-1111-4111-8111-111111111111';
const ITEM_SOLD = 'bbbbbbbb-2222-4222-8222-222222222222';
const ITEM_DEAD = 'bbbbbbbb-3333-4333-8333-333333333333';

// One active category + one inactive (so the §12 filter is genuinely exercised).
const DB_CATEGORIES = [
  { id: CAT_MANDI, petpooja_id: 'cat_mandi', name: 'Arabian Mandi', sort_order: 1, is_active: true },
  { id: CAT_DEAD, petpooja_id: 'cat_dead', name: 'Dead', sort_order: 2, is_active: false },
];

// Prices are STRINGS here on purpose — Postgres numeric comes back as a string over the wire,
// and the route must coerce it to a number. FAHAM (active/available), SOLD (active/sold-out),
// DEAD (under the inactive category → must be filtered out with its category).
const DB_ITEMS = [
  { id: ITEM_FAHAM, petpooja_id: 'item_faham', category_id: CAT_MANDI, name: 'Chicken Faham Mandi (Half)', description: 'Smoky', price: '499', is_veg: false, is_available: true, image_url: null, sort_order: 1 },
  { id: ITEM_SOLD, petpooja_id: 'item_sold', category_id: CAT_MANDI, name: 'Sold Out Special', description: null, price: '250.50', is_veg: true, is_available: false, image_url: null, sort_order: 2 },
  { id: ITEM_DEAD, petpooja_id: 'item_dead', category_id: CAT_DEAD, name: 'Hidden Item', description: null, price: '100', is_veg: true, is_available: true, image_url: null, sort_order: 3 },
];

// Mock the two supabase reads getMenuFromDb performs: each is
// `supabase.from(table).select(...).order(...)` resolving to { data, error }.
function installMocks({ categories = DB_CATEGORIES, items = DB_ITEMS, catError = null, itemError = null } = {}) {
  vi.spyOn(supabase, 'from').mockImplementation((table) => {
    if (table === 'menu_categories') {
      const q = {};
      q.select = vi.fn(() => q);
      q.order = vi.fn(() => Promise.resolve({ data: categories, error: catError }));
      return q;
    }
    if (table === 'menu_items') {
      const q = {};
      q.select = vi.fn(() => q);
      q.order = vi.fn(() => Promise.resolve({ data: items, error: itemError }));
      return q;
    }
    throw new Error(`unexpected table in test: ${table}`);
  });
}

describe('GET /api/menu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with the §12 contract: non-empty categories + items arrays', async () => {
    installMocks();
    const res = await request(app).get('/api/menu');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThan(0);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('shapes categories and items per the DB-backed §12 contract (both ids exposed)', async () => {
    installMocks();
    const res = await request(app).get('/api/menu');

    const category = res.body.categories[0];
    expect(category).toEqual(
      expect.objectContaining({
        id: expect.any(String), // uuid — new in S8
        petpooja_id: expect.any(String),
        name: expect.any(String),
        sort_order: expect.any(Number),
        is_active: expect.any(Boolean),
      })
    );

    const item = res.body.items[0];
    expect(item).toEqual(
      expect.objectContaining({
        id: expect.any(String), // uuid — the cart key for the order path
        petpooja_id: expect.any(String),
        category_id: expect.any(String), // uuid FK
        category_ref: expect.any(String), // parent petpooja_id, backward-compat
        name: expect.any(String),
        price: expect.any(Number),
        is_veg: expect.any(Boolean),
        is_available: expect.any(Boolean),
      })
    );
  });

  it('exposes both id (uuid) and petpooja_id and category_id on every item', async () => {
    installMocks();
    const res = await request(app).get('/api/menu');

    const faham = res.body.items.find((i) => i.petpooja_id === 'item_faham');
    expect(faham.id).toBe(ITEM_FAHAM);
    expect(faham.petpooja_id).toBe('item_faham');
    expect(faham.category_id).toBe(CAT_MANDI);
    expect(faham.category_ref).toBe('cat_mandi');
  });

  it('coerces a DB numeric price (string) into a number', async () => {
    installMocks();
    const res = await request(app).get('/api/menu');

    const faham = res.body.items.find((i) => i.petpooja_id === 'item_faham');
    expect(typeof faham.price).toBe('number');
    expect(faham.price).toBe(499);

    const sold = res.body.items.find((i) => i.petpooja_id === 'item_sold');
    expect(typeof sold.price).toBe('number');
    expect(sold.price).toBe(250.5);
  });

  it('keeps referential integrity: every item.category_ref resolves to a returned category', async () => {
    installMocks();
    const res = await request(app).get('/api/menu');

    const categoryIds = new Set(res.body.categories.map((c) => c.petpooja_id));
    for (const item of res.body.items) {
      expect(categoryIds.has(item.category_ref)).toBe(true);
    }
  });

  it('keeps unavailable items but exposes the is_available flag (frontend renders "sold out")', async () => {
    installMocks();
    const res = await request(app).get('/api/menu');

    for (const item of res.body.items) {
      expect(typeof item.is_available).toBe('boolean');
    }
    // The sold-out item is still served (not dropped), just flagged.
    const sold = res.body.items.find((i) => i.petpooja_id === 'item_sold');
    expect(sold).toBeDefined();
    expect(sold.is_available).toBe(false);
  });

  it('excludes inactive categories AND their items (filter runs on DB rows)', async () => {
    installMocks();
    const res = await request(app).get('/api/menu');

    const categoryIds = res.body.categories.map((c) => c.petpooja_id);
    expect(categoryIds).toContain('cat_mandi');
    expect(categoryIds).not.toContain('cat_dead');

    const itemIds = res.body.items.map((i) => i.petpooja_id);
    expect(itemIds).toContain('item_faham');
    expect(itemIds).not.toContain('item_dead'); // its category is inactive
  });
});
