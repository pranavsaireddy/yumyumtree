'use strict';

const express = require('express');

const asyncHandler = require('../middleware/asyncHandler');
const petpooja = require('../services/petpooja');

const router = express.Router();

// GET /api/menu — PUBLIC (no auth). Architecture §12: full menu as { categories, items },
// a flat item list plus categories that the frontend groups by category.
//
// SOURCE (S8): reads the DB (menu_categories + menu_items, seeded in S7) via
// petpooja.getMenuFromDb, so every item carries its real uuid `id`. The cart now stores that
// id and checkout sends it to POST /api/orders. Both ids are exposed: `id` (uuid) and
// `petpooja_id` on categories; `id` (uuid), `petpooja_id`, `category_id` (uuid) and
// `category_ref` (parent petpooja_id, backward-compat) on items.
//
// Visibility rules (§12) — owned by the route, unchanged, now over DB rows:
//   - Inactive categories (is_active === false) are excluded, along with their items
//     (so no item is left orphaned — referential integrity for the client).
//   - Unavailable items (is_available === false) are KEPT, with the flag, so the frontend
//     can render them as "sold out". Availability is a display concern, not a filter.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { categories, items } = await petpooja.getMenuFromDb();

    const activeCategories = categories.filter((c) => c.is_active !== false);
    const activeIds = new Set(activeCategories.map((c) => c.petpooja_id));
    const visibleItems = items.filter((i) => activeIds.has(i.category_ref));

    res.status(200).json({ categories: activeCategories, items: visibleItems });
  })
);

module.exports = router;
