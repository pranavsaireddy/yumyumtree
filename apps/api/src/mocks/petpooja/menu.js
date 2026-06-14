'use strict';

// Mock PetPooja menu seed — the real YumYumTree menu, verbatim from the S4 prompt.
// This stands in for PetPooja's getCategory / getItems responses until S21 wires the
// real HTTP sync into menu_categories / menu_items. Shape mirrors architecture §6:
//   category: { petpooja_id, name, sort_order, is_active }
//   item:     { petpooja_id, category_ref, name, description, price, is_veg, is_available, image_url }
// `category_ref` is the parent category's petpooja_id (the eventual FK in the DB-backed
// version). Money is rupees (numeric), matching the DB. No addons (Cut C-02).

const categories = [
  { petpooja_id: 'cat_mandi', name: 'Arabian Mandi', sort_order: 1, is_active: true },
  { petpooja_id: 'cat_starters', name: 'Starters', sort_order: 2, is_active: true },
  { petpooja_id: 'cat_kebabs', name: 'Kebabs', sort_order: 3, is_active: true },
  { petpooja_id: 'cat_shawarma', name: 'Shawarma', sort_order: 4, is_active: true },
  { petpooja_id: 'cat_rolls', name: 'Rolls', sort_order: 5, is_active: true },
  { petpooja_id: 'cat_burgers', name: 'Burgers', sort_order: 6, is_active: true },
  { petpooja_id: 'cat_desserts', name: 'Arabic Desserts', sort_order: 7, is_active: true },
  { petpooja_id: 'cat_beverages', name: 'Beverages', sort_order: 8, is_active: true },
  { petpooja_id: 'cat_extras', name: 'Extras', sort_order: 9, is_active: true },
];

// Helper keeps each item terse and consistent: description defaults to null (the seed
// carries none), image_url is always null (PetPooja images are out of scope), and every
// seed item is available. is_veg is explicit per the menu.
function item(petpooja_id, category_ref, name, price, is_veg) {
  return {
    petpooja_id,
    category_ref,
    name,
    description: null,
    price,
    is_veg,
    is_available: true,
    image_url: null,
  };
}

const items = [
  // ── Arabian Mandi (cat_mandi) ─────────────────────────────────────────────
  item('item_chicken_faham_half', 'cat_mandi', 'Chicken Faham Mandi (Half)', 499, false),
  item('item_chicken_faham_full', 'cat_mandi', 'Chicken Faham Mandi (Full)', 699, false),
  item('item_chicken_bbq_half', 'cat_mandi', 'Chicken BBQ Mandi (Half)', 499, false),
  item('item_chicken_bbq_full', 'cat_mandi', 'Chicken BBQ Mandi (Full)', 699, false),
  item('item_chicken_steak_half', 'cat_mandi', 'Chicken Steak Mandi (Half)', 445, false),
  item('item_chicken_steak_full', 'cat_mandi', 'Chicken Steak Mandi (Full)', 599, false),
  item('item_arabi_juicy_chicken_full_bird', 'cat_mandi', 'Arabi Juicy Chicken Mandi (Full Bird)', 799, false),
  item('item_chicken_wings_mandi_half', 'cat_mandi', 'Chicken Wings Mandi (Half)', 445, false),
  item('item_chicken_wings_mandi_full', 'cat_mandi', 'Chicken Wings Mandi (Full)', 595, false),
  item('item_mutton_juicy_marag_half', 'cat_mandi', 'Mutton Juicy (Marag) Mandi (Half)', 599, false),
  item('item_mutton_juicy_marag_full', 'cat_mandi', 'Mutton Juicy (Marag) Mandi (Full)', 899, false),
  item('item_mutton_fry_half', 'cat_mandi', 'Mutton Fry Mandi (Half)', 499, false),
  item('item_mutton_fry_full', 'cat_mandi', 'Mutton Fry Mandi (Full)', 799, false),
  item('item_arabian_fish_half', 'cat_mandi', 'Arabian Fish Mandi (Half)', 549, false),
  item('item_arabian_fish_full', 'cat_mandi', 'Arabian Fish Mandi (Full)', 849, false),
  item('item_mutton_hand_piece_full', 'cat_mandi', 'Mutton Hand Piece Mandi (Full)', 1399, false),
  item('item_special_veg_mandi_half', 'cat_mandi', 'Special Veg Mandi (Half)', 250, true),
  item('item_special_veg_mandi_full', 'cat_mandi', 'Special Veg Mandi (Full)', 350, true),
  item('item_arabian_mix_mandi', 'cat_mandi', 'Arabian Mix Mandi', 1399, false),
  item('item_veg_mix_mandi', 'cat_mandi', 'Veg Mix Mandi (for 4)', 899, true),
  item('item_chef_special_chicken_juicy_half', 'cat_mandi', "Chef's Special Chicken Juicy Mandi (Half)", 549, false),
  item('item_chef_special_chicken_juicy_full', 'cat_mandi', "Chef's Special Chicken Juicy Mandi (Full)", 799, false),
  item('item_chef_special_perry_perry_half', 'cat_mandi', "Chef's Special Perry Perry Mandi (Half)", 549, false),
  item('item_chef_special_perry_perry_full', 'cat_mandi', "Chef's Special Perry Perry Mandi (Full)", 799, false),

  // ── Starters (cat_starters) ───────────────────────────────────────────────
  item('item_veg_stick', 'cat_starters', 'Veg Stick', 175, true),
  item('item_garlic_poppers_balls', 'cat_starters', 'Garlic Poppers Balls', 120, true),
  item('item_cheesy_balls', 'cat_starters', 'Cheesy Balls', 120, true),
  item('item_crinkle_fries', 'cat_starters', 'Crinkle Fries', 140, true),
  item('item_french_fries', 'cat_starters', 'French Fries', 99, true),
  item('item_falafal', 'cat_starters', 'Falafal', 130, true),
  item('item_chicken_nuggets_6pcs', 'cat_starters', 'Chicken Nuggets (6 Pcs)', 145, false),
  item('item_chicken_wings_starter', 'cat_starters', 'Chicken Wings', 165, false),
  item('item_chicken_bbq_tikka', 'cat_starters', 'Chicken BBQ Tikka', 185, false),
  item('item_chicken_tikka', 'cat_starters', 'Chicken Tikka', 185, false),
  item('item_arabi_juicy_chicken_starter_full_bird', 'cat_starters', 'Arabi Juicy Chicken (Full Bird)', 549, false),
  item('item_grill_fish_tikka', 'cat_starters', 'Grill Fish Tikka', 299, false),
  item('item_arabian_mix_grill_platter', 'cat_starters', 'Arabian Mix Grill Platter', 1399, false),
  item('item_fish_fillets', 'cat_starters', 'Fish Fillets', 249, false),
  item('item_arabian_chicken_kebab_6pcs', 'cat_starters', 'Arabian Chicken Kebab (6 Pcs)', 299, false),
  item('item_chicken_cheese_nuggets_8pcs', 'cat_starters', 'Chicken Cheese Nuggets (8 Pcs)', 199, false),

  // ── Kebabs (cat_kebabs) ───────────────────────────────────────────────────
  item('item_sheesh_tawook', 'cat_kebabs', 'Sheesh Tawook', 270, false),
  item('item_grilled_tandoori_chicken', 'cat_kebabs', 'Grilled Tandoori Chicken', 445, false),
  item('item_turkish_grill', 'cat_kebabs', 'Turkish Grill', 499, false),
  item('item_lebanese_grill', 'cat_kebabs', 'Lebanese Grill', 249, false),
  item('item_malai_grill_half', 'cat_kebabs', 'Malai Grill (Half)', 245, false),
  item('item_malai_grill_full', 'cat_kebabs', 'Malai Grill (Full)', 445, false),

  // ── Shawarma (cat_shawarma) ───────────────────────────────────────────────
  item('item_chicken_juicy_shawarma', 'cat_shawarma', 'Chicken Juicy Shawarma', 130, false),
  item('item_grill_roti_shawarma', 'cat_shawarma', 'Grill Roti Shawarma', 140, false),
  item('item_spl_chicken_cheese_shawarma', 'cat_shawarma', 'Spl Chicken Cheese Shawarma', 150, false),
  item('item_spl_turkish_shawarma', 'cat_shawarma', 'Spl Turkish Shawarma', 150, false),
  item('item_spl_falafel_roti_shawarma', 'cat_shawarma', 'Spl Falafel Roti Shawarma', 150, false),

  // ── Rolls (cat_rolls) ─────────────────────────────────────────────────────
  item('item_chicken_zinger_roll', 'cat_rolls', 'Chicken Zinger Roll', 110, false),
  item('item_chicken_tandoori_roll', 'cat_rolls', 'Chicken Tandoori Roll', 110, false),
  item('item_chicken_grill_roll', 'cat_rolls', 'Chicken Grill Roll', 110, false),
  item('item_spl_chicken_kebab_roll', 'cat_rolls', 'Spl Chicken Kebab Roll', 120, false),
  item('item_chicken_bbq_roll', 'cat_rolls', 'Chicken BBQ Roll', 110, false),
  item('item_chicken_nugget_roll', 'cat_rolls', 'Chicken Nugget Roll', 115, false),
  item('item_chicken_teriyaki_roll', 'cat_rolls', 'Chicken Teriyaki Roll', 120, false),
  item('item_fish_roll', 'cat_rolls', 'Fish Roll', 135, false),
  item('item_fish_zinger_roll', 'cat_rolls', 'Fish Zinger Roll', 135, false),
  item('item_veg_grill_roll', 'cat_rolls', 'Veg Grill Roll', 85, true),
  item('item_falafel_roll', 'cat_rolls', 'Falafel Roll', 99, true),
  item('item_cheese_grill_roll', 'cat_rolls', 'Cheese Grill Roll', 90, true),

  // ── Burgers (cat_burgers) ─────────────────────────────────────────────────
  item('item_chicken_burger', 'cat_burgers', 'Chicken Burger', 99, false),
  item('item_chicken_jumbo_burger', 'cat_burgers', 'Chicken Jumbo Burger', 120, false),
  item('item_chicken_zinger_burger', 'cat_burgers', 'Chicken Zinger Burger', 110, false),
  item('item_chicken_tandoori_burger', 'cat_burgers', 'Chicken Tandoori Burger', 110, false),
  item('item_chicken_teriyaki_burger', 'cat_burgers', 'Chicken Teriyaki Burger', 120, false),
  item('item_chicken_bbq_burger', 'cat_burgers', 'Chicken BBQ Burger', 110, false),
  item('item_chicken_nugget_burger', 'cat_burgers', 'Chicken Nugget Burger', 115, false),
  item('item_chicken_grill_burger', 'cat_burgers', 'Chicken Grill Burger', 110, false),
  item('item_fish_zinger_burger', 'cat_burgers', 'Fish Zinger Burger (Veg Salad)', 135, false),
  item('item_veg_burger', 'cat_burgers', 'Veg Burger', 80, true),
  item('item_aloo_tikka_burger', 'cat_burgers', 'Aloo Tikka Burger', 80, true),
  item('item_cheese_burger', 'cat_burgers', 'Cheese Burger (Veg Salad)', 90, true),

  // ── Arabic Desserts (cat_desserts) ────────────────────────────────────────
  item('item_kadhu_ki_kheer', 'cat_desserts', 'Kadhu ki Kheer', 100, true),
  item('item_baklava', 'cat_desserts', 'Baklava', 130, true),
  item('item_russian_honey_cake', 'cat_desserts', 'Russian Honey Cake', 140, true),
  item('item_basbousa_cheese_cake', 'cat_desserts', 'Basbousa Cheese Cake', 130, true),
  item('item_mulberry', 'cat_desserts', 'Mulberry', 130, true),
  item('item_gulab_jamun', 'cat_desserts', 'Gulab Jamun', 100, true),

  // ── Beverages (cat_beverages) ─────────────────────────────────────────────
  item('item_mineral_water', 'cat_beverages', 'Mineral Water', 20, true),
  item('item_soft_drinks_750ml', 'cat_beverages', 'Soft Drinks (750 ML)', 40, true),

  // ── Extras (cat_extras) ───────────────────────────────────────────────────
  item('item_yum_yum_tree_salad_veg', 'cat_extras', 'Yum Yum Tree Salad (Veg)', 120, true),
  item('item_yum_yum_tree_salad_non_veg', 'cat_extras', 'Yum Yum Tree Salad (Non-Veg)', 150, false),
  item('item_fried_onion', 'cat_extras', 'Fried Onion', 30, true),
  item('item_mayonnaise', 'cat_extras', 'Mayonnaise', 30, true),
  item('item_cheese', 'cat_extras', 'Cheese', 20, true),
];

module.exports = { categories, items };
