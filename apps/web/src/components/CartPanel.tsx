"use client";

// The cart UI. Same panel serves both breakpoints: a right-side DRAWER on
// desktop and a slide-up SHEET on mobile (positioning switches at md). Always
// mounted so it can animate; pointer events are disabled while closed.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { formatPrice } from "@/lib/menu";
import { useCartStore, useCartSubtotal } from "@/store/cart";
import { useCartUiStore } from "@/store/cart-ui";

export default function CartPanel() {
  const lines = useCartStore((s) => s.lines);
  const incrementQty = useCartStore((s) => s.incrementQty);
  const decrementQty = useCartStore((s) => s.decrementQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const subtotal = useCartSubtotal();

  const isOpen = useCartUiStore((s) => s.isOpen);
  const close = useCartUiStore((s) => s.close);

  const router = useRouter();

  // Rehydrate the persisted cart from localStorage once on the client, after mount. The store
  // uses skipHydration so the server render and first client render stay empty (no hydration
  // mismatch); this restores the saved cart immediately afterwards. CartPanel is always mounted
  // in the root layout, so this runs on every route.
  useEffect(() => {
    useCartStore.persist.rehydrate();
  }, []);

  const items = Object.values(lines);
  const isEmpty = items.length === 0;

  // Close the cart, then route to checkout. Same handler serves both breakpoints
  // (this panel is the desktop drawer AND the mobile sheet). The login gate +
  // address form + order placement all live on /checkout.
  function goToCheckout() {
    close();
    router.push("/checkout");
  }

  return (
    <div
      className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        onClick={close}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel: slide-up sheet on mobile, right drawer on md+ */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        className={`absolute flex flex-col bg-cream shadow-2xl transition-transform duration-300
          bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl
          md:left-auto md:top-0 md:h-full md:max-h-none md:w-[420px] md:rounded-none
          ${
            isOpen
              ? "translate-y-0 md:translate-x-0"
              : "translate-y-full md:translate-y-0 md:translate-x-full"
          }`}
      >
        <div className="flex items-center justify-between border-b border-charcoal/10 bg-navy px-4 py-3 text-cream md:rounded-none">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gold">
            <ShoppingCart size={20} />
            Your cart
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close cart"
            className="flex h-8 w-8 items-center justify-center rounded-full text-cream transition-colors hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <ShoppingCart size={40} className="text-charcoal/30" />
            <p className="text-base font-semibold text-charcoal">
              Your cart is empty
            </p>
            <p className="text-sm text-charcoal/60">
              Add a dish from the menu to get started.
            </p>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-charcoal/10 overflow-y-auto px-4">
              {items.map(({ item, quantity }) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-charcoal">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-xs text-charcoal/60">
                      {formatPrice(item.price)} each
                    </p>
                    <div className="mt-2 inline-flex items-center gap-3 rounded-full bg-navy px-2 py-1 text-cream">
                      <button
                        type="button"
                        aria-label={`Remove one ${item.name}`}
                        onClick={() => decrementQty(item.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-gold transition-colors hover:bg-white/10"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="min-w-4 text-center text-sm font-semibold tabular-nums">
                        {quantity}
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
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm font-bold text-charcoal tabular-nums">
                      {formatPrice(item.price * quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.name} from cart`}
                      className="text-charcoal/40 transition-colors hover:text-nonveg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-charcoal/10 px-4 py-4">
              <div className="flex items-center justify-between text-base font-bold text-charcoal">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatPrice(subtotal)}</span>
              </div>
              {/* Display-only preview. The authoritative total is recomputed
                  server-side at checkout — see the subtotal selector in store/cart.ts. */}
              <p className="mt-1 text-xs text-charcoal/50">
                Taxes and final total are confirmed at checkout.
              </p>

              <button
                type="button"
                onClick={goToCheckout}
                className="mt-4 w-full rounded-full bg-navy px-4 py-3 text-sm font-bold text-cream transition-colors hover:bg-navy/90"
              >
                Checkout
              </button>
              <button
                type="button"
                onClick={clearCart}
                className="mt-2 w-full rounded-full px-4 py-2 text-sm font-semibold text-charcoal/60 transition-colors hover:text-nonveg"
              >
                Clear cart
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
