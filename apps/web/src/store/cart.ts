"use client";

// Cart (Zustand), PERSISTED to localStorage (architecture §19: "Zustand, persisted to
// localStorage, versioned"). Persistence matters because the Google sign-in flow is a full-page
// redirect (→ Google → /auth/callback → /checkout) which would otherwise wipe an in-memory cart
// out from under a logged-out user checking out. Lines are keyed by the item's uuid `id` (S8 —
// so checkout sends item_id: id to POST /api/orders); each line snapshots the menu item + qty.
//
// SSR-safety (Next 16 App Router): localStorage doesn't exist during server render, so we
// skipHydration and rehydrate manually on the client after mount (see CartPanel). That keeps the
// server render and the first client render both empty — no hydration mismatch — then the cart
// restores. Only the line items persist; transient UI state (drawer open/closed) lives in the
// separate, in-memory cart-ui store.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: {},

      addItem: (item) =>
        set((state) => {
          const existing = state.lines[item.id];
          const quantity = existing ? existing.quantity + 1 : 1;
          return {
            lines: { ...state.lines, [item.id]: { item, quantity } },
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
    }),
    {
      // Versioned (start at 1) so a future cart-shape change can invalidate stale persisted
      // carts via persist's version/migrate mechanism. Only `lines` is persisted.
      name: "yyt-cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ lines: state.lines }),
      // Manual rehydration on the client (CartPanel) — see the SSR-safety note above.
      skipHydration: true,
    }
  )
);

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
