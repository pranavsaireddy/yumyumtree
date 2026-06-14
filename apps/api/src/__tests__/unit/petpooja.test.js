'use strict';

// describe/it/expect are globals (vitest.config.js → test.globals).
const petpooja = require('../../services/petpooja');
const seed = require('../../mocks/petpooja/menu');

// The service defaults to 'mock' mode (PETPOOJA_MODE unset in test env), so getMenu()
// returns the seed verbatim. 'live' mode is a hard 501 until S21; that branch can't be
// exercised here without flipping config, so we assert the mock contract only.
describe('petpooja service (mock mode)', () => {
  it('runs in mock mode by default', () => {
    expect(petpooja.MODE).toBe('mock');
  });

  it('getMenu() returns the seed shaped as { categories, items }', async () => {
    const menu = await petpooja.getMenu();
    expect(menu.categories).toEqual(seed.categories);
    expect(menu.items).toEqual(seed.items);
  });

  it('spot-checks seed prices against the source menu', async () => {
    const menu = await petpooja.getMenu();
    const byId = Object.fromEntries(menu.items.map((i) => [i.petpooja_id, i]));
    expect(byId.item_chicken_faham_half.price).toBe(499);
    expect(byId.item_mutton_hand_piece_full.price).toBe(1399);
    expect(byId.item_french_fries.price).toBe(99);
  });

  it('getCategories() / getItems() are thin wrappers over getMenu()', async () => {
    expect(await petpooja.getCategories()).toEqual(seed.categories);
    expect(await petpooja.getItems()).toEqual(seed.items);
  });
});
