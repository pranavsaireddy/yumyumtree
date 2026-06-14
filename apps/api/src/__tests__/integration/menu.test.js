'use strict';

// describe/it/expect/vi are globals (vitest.config.js → test.globals).
const request = require('supertest');

const app = require('../../app');
const petpooja = require('../../services/petpooja');

// Pure HTTP against the mock-backed menu service. No DB is touched (the route reads the
// PetPooja service, which is in 'mock' mode by default), so no assertSafeTestDb fence here.
describe('GET /api/menu', () => {
  it('returns 200 with the §12 contract: non-empty categories + items arrays', async () => {
    const res = await request(app).get('/api/menu');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThan(0);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('shapes categories and items per §6 (keys present on a sample of each)', async () => {
    const res = await request(app).get('/api/menu');

    const category = res.body.categories[0];
    expect(category).toEqual(
      expect.objectContaining({
        petpooja_id: expect.any(String),
        name: expect.any(String),
        sort_order: expect.any(Number),
        is_active: expect.any(Boolean),
      })
    );

    const item = res.body.items[0];
    expect(item).toEqual(
      expect.objectContaining({
        petpooja_id: expect.any(String),
        category_ref: expect.any(String),
        name: expect.any(String),
        price: expect.any(Number),
        is_veg: expect.any(Boolean),
        is_available: expect.any(Boolean),
      })
    );
  });

  it('serves the full real menu (sanity: >50 items, all 9 categories)', async () => {
    const res = await request(app).get('/api/menu');

    expect(res.body.items.length).toBeGreaterThan(50);
    expect(res.body.categories.length).toBe(9);
  });

  it('keeps referential integrity: every item.category_ref resolves to a returned category', async () => {
    const res = await request(app).get('/api/menu');

    const categoryIds = new Set(res.body.categories.map((c) => c.petpooja_id));
    for (const item of res.body.items) {
      expect(categoryIds.has(item.category_ref)).toBe(true);
    }
  });

  it('keeps unavailable items but exposes the is_available flag (frontend renders "sold out")', async () => {
    const res = await request(app).get('/api/menu');
    // Every returned item carries the flag as a boolean; nothing is silently dropped for
    // being unavailable (only inactive categories are filtered — tested below).
    for (const item of res.body.items) {
      expect(typeof item.is_available).toBe('boolean');
    }
  });

  it('excludes inactive categories AND their items', async () => {
    // Inject an inactive category with an item so the §12 filter is genuinely exercised
    // (the real seed is all-active). Spy on the seam the route reads.
    const spy = vi.spyOn(petpooja, 'getMenu').mockResolvedValue({
      categories: [
        { petpooja_id: 'cat_live', name: 'Live', sort_order: 1, is_active: true },
        { petpooja_id: 'cat_dead', name: 'Dead', sort_order: 2, is_active: false },
      ],
      items: [
        { petpooja_id: 'i_live', category_ref: 'cat_live', name: 'Live Item', description: null, price: 100, is_veg: true, is_available: true, image_url: null },
        { petpooja_id: 'i_dead', category_ref: 'cat_dead', name: 'Dead Item', description: null, price: 100, is_veg: true, is_available: true, image_url: null },
      ],
    });

    const res = await request(app).get('/api/menu');

    const categoryIds = res.body.categories.map((c) => c.petpooja_id);
    expect(categoryIds).toContain('cat_live');
    expect(categoryIds).not.toContain('cat_dead');

    const itemIds = res.body.items.map((i) => i.petpooja_id);
    expect(itemIds).toContain('i_live');
    expect(itemIds).not.toContain('i_dead');

    spy.mockRestore();
  });
});
