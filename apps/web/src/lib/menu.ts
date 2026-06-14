// Typed client for the backend menu API (apps/api · GET /api/menu).
// Used by the menu page, which is a SERVER component — this helper runs on the
// server at render time, never in the browser. Shapes mirror architecture §6 /
// the S4 mock seed.

export interface Category {
  petpooja_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface MenuItem {
  petpooja_id: string;
  category_ref: string;
  name: string;
  description: string | null;
  price: number; // rupees (numeric in DB); display-only on the client
  is_veg: boolean;
  is_available: boolean;
  image_url: string | null;
}

export interface Menu {
  categories: Category[];
  items: MenuItem[];
}

// A category paired with its items, ready to render in sort_order.
export interface MenuSection {
  category: Category;
  items: MenuItem[];
}

// Fetches the menu server-side. Returns null on any failure (backend down,
// non-2xx, bad JSON, missing config) so the page can show a friendly
// "temporarily unavailable" state instead of crashing the render.
export async function getMenu(): Promise<Menu | null> {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!baseUrl) return null;

  try {
    // no-store for now; ISR/caching tuning is a later session.
    const res = await fetch(`${baseUrl}/api/menu`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Menu;
  } catch {
    return null;
  }
}

// Groups the flat item list under its parent category (item.category_ref ===
// category.petpooja_id) and orders sections by category sort_order. The API
// already excludes inactive categories and their items.
export function toSections(menu: Menu): MenuSection[] {
  const sorted = [...menu.categories].sort((a, b) => a.sort_order - b.sort_order);
  return sorted
    .map((category) => ({
      category,
      items: menu.items.filter((i) => i.category_ref === category.petpooja_id),
    }))
    .filter((section) => section.items.length > 0);
}

// Rupee formatting with Indian digit grouping (e.g. ₹1,399).
export function formatPrice(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN")}`;
}
