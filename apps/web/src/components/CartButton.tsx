"use client";

// Header cart trigger (desktop). Shows the live item count as a badge and opens
// the cart panel. Hidden on mobile — the sticky bottom bar owns that breakpoint.

import { ShoppingCart } from "lucide-react";
import { useCartCount } from "@/store/cart";
import { useCartUiStore } from "@/store/cart-ui";

export default function CartButton() {
  const count = useCartCount();
  const open = useCartUiStore((s) => s.open);

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Open cart${count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ""}`}
      className="relative hidden items-center gap-2 rounded-full border border-gold/40 px-4 py-2 text-sm font-semibold text-gold transition-colors hover:bg-white/5 md:inline-flex"
    >
      <ShoppingCart size={18} />
      Cart
      {count > 0 && (
        <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-xs font-bold text-navy tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}
