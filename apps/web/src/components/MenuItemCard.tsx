// A single menu item card. Server-rendered HTML; only the <AddToCartButton />
// inside it is a client island. Unavailable items are visually muted and the
// Add control is disabled. Half/Full variants arrive as separate items with the
// suffix already in the name — rendered as-is, no special grouping.

import type { MenuItem } from "@/lib/menu";
import { formatPrice } from "@/lib/menu";
import AddToCartButton from "@/components/AddToCartButton";
import VegBadge from "@/components/VegBadge";

export default function MenuItemCard({ item }: { item: MenuItem }) {
  const soldOut = item.is_available === false;

  return (
    <article
      className={`flex h-full flex-col gap-3 rounded-xl border border-charcoal/10 bg-white p-4 shadow-sm ${
        soldOut ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1">
          <VegBadge isVeg={item.is_veg} />
        </span>
        <h3 className="text-base font-semibold leading-snug text-charcoal">
          {item.name}
          {soldOut && (
            <span className="ml-2 align-middle text-xs font-medium uppercase tracking-wide text-nonveg">
              Sold out
            </span>
          )}
        </h3>
      </div>

      {item.description && (
        <p className="text-sm leading-relaxed text-charcoal/60">
          {item.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-lg font-bold text-gold-dim">
          {formatPrice(item.price)}
        </span>
        <AddToCartButton item={item} />
      </div>
    </article>
  );
}
