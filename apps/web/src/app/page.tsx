// Menu page — SERVER COMPONENT. Fetches the menu server-side at render time
// (no 'use client', no useEffect, no client-side menu fetching) and renders the
// category sections + item cards as server HTML. The only interactive bits are
// the client islands inside the cards and the cart (mounted in the layout).

import { getMenu, toSections } from "@/lib/menu";
import MenuItemCard from "@/components/MenuItemCard";

export default async function Home() {
  const menu = await getMenu();

  // Graceful API-down state — never crash the render.
  if (!menu) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-charcoal">
          Menu temporarily unavailable
        </h1>
        <p className="text-charcoal/60">
          We couldn&apos;t load the menu right now. Please refresh in a moment.
        </p>
      </div>
    );
  }

  const sections = toSections(menu);

  return (
    // Bottom padding leaves room for the mobile sticky cart bar so the last
    // items are never hidden behind it.
    <div className="mx-auto max-w-6xl px-4 py-8 pb-28 md:pb-12">
      <h1 className="mb-8 text-2xl font-bold text-charcoal sm:text-3xl">
        Our Menu
      </h1>

      {sections.length === 0 ? (
        <p className="text-charcoal/60">No items are available right now.</p>
      ) : (
        <div className="flex flex-col gap-12">
          {sections.map(({ category, items }) => (
            <section key={category.petpooja_id} id={category.petpooja_id}>
              <h2 className="mb-4 border-b-2 border-gold/40 pb-2 text-xl font-bold text-navy sm:text-2xl">
                {category.name}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <MenuItemCard key={item.petpooja_id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
