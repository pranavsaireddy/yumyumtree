'use strict';

// seedMenu.js — standalone, HUMAN-RUN script: `node scripts/seedMenu.js` (from apps/api).
// NOT wired into the app, NOT a route, NOT run by tests. It loads the S4 mock menu seed
// into the real DEV database, resolving the category_ref(text) → category_id(uuid FK) gap
// (debt T-009) so the order path can fetch menu_items by their real uuid id.
//
// Uses the service-role supabase client (bypasses deny-all RLS — the only writer allowed).
// IDEMPOTENT: every upsert targets the UNIQUE petpooja_id column, so re-running never
// duplicates rows. Prints a summary and exits non-zero on any error.
//
// Side effects on the real DEV DB — the human runs it once and verifies row counts in
// Supabase. Claude Code does NOT run this.

const supabase = require('../src/lib/supabase');
const logger = require('../src/lib/logger');
const seed = require('../src/mocks/petpooja/menu');

async function main() {
  // ── Categories ───────────────────────────────────────────────────────────
  const categoryRows = seed.categories.map((c) => ({
    petpooja_id: c.petpooja_id,
    name: c.name,
    sort_order: c.sort_order,
    is_active: c.is_active,
  }));

  const { error: catError } = await supabase
    .from('menu_categories')
    .upsert(categoryRows, { onConflict: 'petpooja_id' });
  if (catError) {
    throw new Error(`Failed to upsert menu_categories: ${catError.message}`);
  }

  // Read categories back to map petpooja_id → category uuid (the FK for menu_items).
  const { data: categories, error: catReadError } = await supabase
    .from('menu_categories')
    .select('id, petpooja_id');
  if (catReadError) {
    throw new Error(`Failed to read back menu_categories: ${catReadError.message}`);
  }
  const categoryIdByPetpooja = {};
  for (const row of categories) {
    categoryIdByPetpooja[row.petpooja_id] = row.id;
  }

  // ── Items ──────────────────────────────────────────────────────────────────
  // Resolve each item's category_ref(text) → category_id(uuid). A missing mapping is a
  // seed integrity error — fail loudly rather than insert an orphan with a null FK.
  const itemRows = seed.items.map((i) => {
    const categoryId = categoryIdByPetpooja[i.category_ref];
    if (!categoryId) {
      throw new Error(`No category found for item ${i.petpooja_id} (category_ref=${i.category_ref})`);
    }
    return {
      petpooja_id: i.petpooja_id,
      category_id: categoryId,
      name: i.name,
      description: i.description,
      price: i.price,
      is_veg: i.is_veg,
      is_available: i.is_available,
      image_url: i.image_url,
    };
  });

  const { error: itemError } = await supabase
    .from('menu_items')
    .upsert(itemRows, { onConflict: 'petpooja_id' });
  if (itemError) {
    throw new Error(`Failed to upsert menu_items: ${itemError.message}`);
  }

  logger.info(
    { categories: categoryRows.length, items: itemRows.length },
    'seedMenu: upsert complete'
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'seedMenu: failed');
    process.exit(1);
  });
