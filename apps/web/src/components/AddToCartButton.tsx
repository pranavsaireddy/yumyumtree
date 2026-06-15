"use client";

// Per-card interactive island. Shows an "Add" button until the item is in the
// cart, then swaps to a −/qty/+ stepper. Unavailable items render a disabled
// "Sold out" control. This is the only interactive bit of an otherwise
// server-rendered menu card.

import { Minus, Plus } from "lucide-react";
import type { MenuItem } from "@/lib/menu";
import { useCartLine, useCartStore } from "@/store/cart";

export default function AddToCartButton({ item }: { item: MenuItem }) {
  const line = useCartLine(item.id);
  const addItem = useCartStore((s) => s.addItem);
  const incrementQty = useCartStore((s) => s.incrementQty);
  const decrementQty = useCartStore((s) => s.decrementQty);

  if (item.is_available === false) {
    return (
      <button
        type="button"
        disabled
        className="cursor-not-allowed rounded-full border border-charcoal/20 px-4 py-1.5 text-sm font-semibold text-charcoal/40"
      >
        Sold out
      </button>
    );
  }

  if (line) {
    return (
      <div className="inline-flex items-center gap-3 rounded-full bg-navy px-2 py-1 text-cream">
        <button
          type="button"
          aria-label={`Remove one ${item.name}`}
          onClick={() => decrementQty(item.id)}
          className="flex h-6 w-6 items-center justify-center rounded-full text-gold transition-colors hover:bg-white/10"
        >
          <Minus size={16} />
        </button>
        <span
          aria-live="polite"
          className="min-w-4 text-center text-sm font-semibold tabular-nums"
        >
          {line.quantity}
        </span>
        <button
          type="button"
          aria-label={`Add one ${item.name}`}
          onClick={() => incrementQty(item.id)}
          className="flex h-6 w-6 items-center justify-center rounded-full text-gold transition-colors hover:bg-white/10"
        >
          <Plus size={16} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => addItem(item)}
      className="inline-flex items-center gap-1 rounded-full border border-navy bg-white px-4 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-navy hover:text-cream"
    >
      <Plus size={16} />
      Add
    </button>
  );
}
