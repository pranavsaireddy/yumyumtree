'use strict';

// PetPooja menu service — THE SEAM. Today it serves a mock seed; S21 replaces the 'mock'
// branch with real PetPooja HTTP (§17 getCategory / getItems) syncing into menu_items /
// menu_categories, and the route reads from the DB. Nothing else in the app changes.
//
// Mode flag pattern (the template every external provider copies): MODE comes from config,
// defaults to 'mock' because PetPooja credentials don't exist yet. 'live' is intentionally
// a hard 501 until S21 — never a silent fallback to mock.

const config = require('./../config');
const seed = require('../mocks/petpooja/menu');

const MODE = config.PETPOOJA_MODE || 'mock';

function notImplemented() {
  const err = new Error('PetPooja live mode is not implemented yet (real sync lands in S21)');
  err.status = 501;
  err.code = 'NOT_IMPLEMENTED';
  return err;
}

// Mimic a network round-trip in mock mode so callers exercise the async path. Jitter only,
// no real I/O; 50-150ms keeps tests fast.
function jitter() {
  const ms = 50 + Math.floor(Math.random() * 100);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// getMenu — the §12 source. Returns the provider's full menu as { categories, items }
// (flat item list + categories; the frontend groups items by category_ref). The route owns
// the §12 visibility filtering (inactive categories), keeping this service a faithful mirror
// of what the provider returns.
async function getMenu() {
  if (MODE === 'live') {
    throw notImplemented();
  }
  await jitter();
  return { categories: seed.categories, items: seed.items };
}

// Thin §17 wrappers (getCategory / getItems map to these). Kept for seam fidelity so S21 can
// swap each branch independently; getMenu is what the route uses today.
async function getCategories() {
  const menu = await getMenu();
  return menu.categories;
}

async function getItems() {
  const menu = await getMenu();
  return menu.items;
}

module.exports = { getMenu, getCategories, getItems, MODE };
