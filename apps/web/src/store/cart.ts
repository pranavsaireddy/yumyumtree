"use client";

// In-memory cart (Zustand). NO persistence this session — the cart intentionally
// vanishes on refresh (localStorage is a later session). Lines are keyed by the
// item's petpooja_id; each line snapshots the menu item plus a quantity.

import { create } from "zustand";
import type { MenuItem } from "@/lib/menu";

export interface CartLine {
  item: MenuItem;
  quantity: number;
}

interface CartState {
  lines: Record<string, CartLine>;
  addItem: (item: MenuItem) => void;
  incrementQty: (id: string) => void;
  decrementQty: (id: string) => void; // removes the line when it would hit 0
  removeItem: (id: string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  lines: {},

  addItem: (item) =>
    set((state) => {
      const existing = state.lines[item.petpooja_id];
      const quantity = existing ? existing.quantity + 1 : 1;
      return {
        lines: { ...state.lines, [item.petpooja_id]: { item, quantity } },
      };
    }),

  incrementQty: (id) =>
    set((state) => {
      const line = state.lines[id];
      if (!line) return state;
      return {
        lines: {
          ...state.lines,
          [id]: { ...line, quantity: line.quantity + 1 },
        },
      };
    }),

  decrementQty: (id) =>
    set((state) => {
      const line = state.lines[id];
      if (!line) return state;
      if (line.quantity <= 1) {
        const rest = { ...state.lines };
        delete rest[id];
        return { lines: rest };
      }
      return {
        lines: {
          ...state.lines,
          [id]: { ...line, quantity: line.quantity - 1 },
        },
      };
    }),

  removeItem: (id) =>
    set((state) => {
      const rest = { ...state.lines };
      delete rest[id];
      return { lines: rest };
    }),

  clearCart: () => set({ lines: {} }),
}));

// ── Selectors ───────────────────────────────────────────────────────────────

// Total number of units across all lines (for the cart badge / bar).
export const useCartCount = () =>
  useCartStore((s) =>
    Object.values(s.lines).reduce((n, l) => n + l.quantity, 0)
  );

// DISPLAY-ONLY running subtotal: sum of item.price × quantity, shown to the
// customer as a preview. The AUTHORITATIVE total is ALWAYS recomputed
// server-side at checkout from DB prices — a later session sends only
// { item_id, quantity }, NEVER any price from this client. Do not treat this
// number as anything but a preview.
export const useCartSubtotal = () =>
  useCartStore((s) =>
    Object.values(s.lines).reduce((sum, l) => sum + l.item.price * l.quantity, 0)
  );

// The line for a single item id (undefined when not in the cart). Lets the
// per-card "Add" control swap to a quantity stepper.
export const useCartLine = (id: string) => useCartStore((s) => s.lines[id]);
