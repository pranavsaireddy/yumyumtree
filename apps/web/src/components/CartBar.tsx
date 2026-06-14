"use client";

// Mobile-only sticky bottom bar: item count + display-only subtotal + a tap
// target that opens the cart sheet. Only renders when the cart is non-empty,
// and is hidden on md+ (the header cart button serves desktop).

import { ShoppingCart } from "lucide-react";
import { formatPrice } from "@/lib/menu";
import { useCartCount, useCartSubtotal } from "@/store/cart";
import { useCartUiStore } from "@/store/cart-ui";

export default function CartBar() {
  const count = useCartCount();
  const subtotal = useCartSubtotal();
  const open = useCartUiStore((s) => s.open);

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={open}
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 bg-navy px-4 py-3 text-cream shadow-[0_-4px_12px_rgba(0,0,0,0.15)] md:hidden"
    >
      <span className="flex items-center gap-2">
        <span className="relative">
          <ShoppingCart size={22} className="text-gold" />
          <span className="absolute -right-2 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy tabular-nums">
            {count}
          </span>
        </span>
        <span className="text-sm font-semibold">
          {/* Display-only preview — authoritative total comes from checkout. */}
          {formatPrice(subtotal)}
        </span>
      </span>
      <span className="text-sm font-bold text-gold">View cart</span>
    </button>
  );
}
