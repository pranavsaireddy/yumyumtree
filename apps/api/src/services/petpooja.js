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
const supabase = require('../lib/supabase');

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

// getMenuFromDb — the route's ACTUAL source as of S8. The S7 seed populated menu_categories
// + menu_items with real uuid ids; the route now reads them so the cart can store an item's
// uuid `id` (POST /api/orders fetches menu_items by id). getMenu() above is UNCHANGED and stays
// the seed source for scripts/seedMenu.js and the S21 live seam — only the route's source moved.
//
// This is a faithful DB mirror: it returns EVERY category and item (ordered by sort_order)
// mapped to the §12 client contract, and does NOT filter. The route keeps ownership of §12
// visibility filtering (inactive categories excluded; unavailable items kept with the flag),
// exactly as before — now over DB rows. Each item carries BOTH ids: `id` (uuid, for the cart →
// order path), `petpooja_id` (text), `category_id` (uuid), and `category_ref` (the parent's
// petpooja_id, kept for backward-compat with the frontend's category_ref grouping).
async function getMenuFromDb() {
  const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('id, petpooja_id, name, sort_order, is_active')
    .order('sort_order', { ascending: true });
  if (catError) {
    const err = new Error('Failed to fetch menu categories');
    err.status = 500;
    err.code = 'MENU_FETCH_FAILED';
    throw err;
  }

  const { data: items, error: itemError } = await supabase
    .from('menu_items')
    .select('id, petpooja_id, category_id, name, description, price, is_veg, is_available, image_url, sort_order')
    .order('sort_order', { ascending: true });
  if (itemError) {
    const err = new Error('Failed to fetch menu items');
    err.status = 500;
    err.code = 'MENU_FETCH_FAILED';
    throw err;
  }

  // category_id (uuid) → petpooja_id (text), so each item can carry category_ref for the
  // backward-compat client contract without a join.
  const petpoojaIdByCategoryId = {};
  for (const c of categories || []) {
    petpoojaIdByCategoryId[c.id] = c.petpooja_id;
  }

  const mappedCategories = (categories || []).map((c) => ({
    id: c.id,
    petpooja_id: c.petpooja_id,
    name: c.name,
    sort_order: c.sort_order,
    is_active: c.is_active,
  }));

  const mappedItems = (items || []).map((i) => ({
    id: i.id,
    petpooja_id: i.petpooja_id,
    category_id: i.category_id,
    category_ref: petpoojaIdByCategoryId[i.category_id] || null,
    name: i.name,
    description: i.description,
    // DB numeric comes back as a string over the wire — coerce so the client never has to.
    price: Number(i.price),
    is_veg: i.is_veg,
    is_available: i.is_available,
    image_url: i.image_url,
  }));

  return { categories: mappedCategories, items: mappedItems };
}

// Thin §17 wrappers (getCategory / getItems map to these). Kept for seam fidelity so S21 can
// swap each branch independently; getMenu is the seed source today.
async function getCategories() {
  const menu = await getMenu();
  return menu.categories;
}

async function getItems() {
  const menu = await getMenu();
  return menu.items;
}

module.exports = { getMenu, getMenuFromDb, getCategories, getItems, MODE };
