"use client";

// /checkout — CLIENT COMPONENT. Delivery-only checkout that ends at order CREATION.
// The Razorpay modal + payment webhook are S9; this page shows a success state and does
// NOT simulate payment.
//
// MONEY-PATH: the frontend NEVER sends a price and NEVER sends customer_id. It posts only
// { item_id (uuid), quantity } per line; the server computes the total from DB prices and
// derives identity from the verified Bearer token. The displayed subtotal is a preview only.
//
// Login is required HERE (D-007 — no guest checkout). Browsing + cart stay anonymous; the
// wall is only on this page. The gate is client-side this session (no @supabase/ssr
// middleware yet — debt). Coordinates are a fixed Hyderabad-center placeholder (real
// geocoding is debt).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, LogIn, ShoppingCart } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useCartStore, useCartSubtotal } from "@/store/cart";
import { formatPrice } from "@/lib/menu";

// Placeholder delivery coordinates — Hyderabad center. The customer never enters these;
// real per-address geocoding is deferred (debt). Stays inside the §27 Hyderabad bounding box.
const HYD_LAT = 17.385;
const HYD_LNG = 78.4867;

interface FieldErrors {
  line1?: string;
  city?: string;
  pincode?: string;
}

export default function CheckoutPage() {
  const lines = useCartStore((s) => s.lines);
  const clearCart = useCartStore((s) => s.clearCart);
  const subtotal = useCartSubtotal();
  const items = Object.values(lines);

  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);

  // One idempotency key per checkout attempt: generated lazily on first submit and reused on
  // retries (a failed/lost POST replays the SAME key, so the server dedupes to one order).
  // Cleared after a successful order so the next order gets a fresh key.
  const idempotencyKeyRef = useRef<string | null>(null);

  // Read the session via the browser client and keep it live (so returning from the Google
  // OAuth redirect flips the gate without a manual refresh).
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Invalidate the idempotency key whenever the CART CONTENTS change, so an edited cart always
  // produces a fresh order on the next Place Order. Without this, a user who edits the cart
  // after a failed POST and retries would replay the ORIGINAL order (place_order keys on
  // idempotency_key alone). Pure retries (same cart) keep the same key and still dedupe to one
  // order — only a content change resets it. The signature is a stable serialization, so this
  // runs only on an actual change, not on every render.
  const cartSignature = items.map((l) => `${l.item.id}:${l.quantity}`).join("|");
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [cartSignature]);

  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // Land back on /checkout after the callback exchanges the code (safeNext-validated).
      options: { redirectTo: `${location.origin}/auth/callback?next=/checkout` },
    });
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    // line1 min length mirrors the server schema (min 5) so we fail fast, not at the API.
    if (line1.trim().length < 5) {
      errors.line1 = "Please enter your full address (at least 5 characters).";
    }
    if (city.trim().length < 2) {
      errors.city = "Please enter your city.";
    }
    if (!/^\d{6}$/.test(pincode)) {
      errors.pincode = "Pincode must be exactly 6 digits.";
    }
    return errors;
  }

  async function placeOrder() {
    setFormError(null);
    setValidationError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backend) {
      setFormError("Checkout is temporarily unavailable. Please try again later.");
      return;
    }

    setSubmitting(true);
    try {
      // Re-read the session at submit time so we send a fresh (possibly refreshed) token.
      const supabase = createClient();
      const {
        data: { session: fresh },
      } = await supabase.auth.getSession();
      if (!fresh) {
        setSession(null);
        setFormError("Please sign in to place your order.");
        return;
      }

      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }

      const res = await fetch(`${backend}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fresh.access_token}`,
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKeyRef.current,
          // item_id is the menu_items uuid; NEVER a price, NEVER customer_id.
          items: items.map((l) => ({ item_id: l.item.id, quantity: l.quantity })),
          order_type: "delivery",
          delivery_address: {
            line1: line1.trim(),
            city: city.trim(),
            pincode,
            lat: HYD_LAT,
            lng: HYD_LNG,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        idempotencyKeyRef.current = null; // next order gets a fresh key
        clearCart();
        setSuccessOrderId(data.order_id);
        return;
      }

      if (res.status === 401) {
        // Token expired/invalid — drop to the sign-in gate (cart + key are kept for retry).
        setSession(null);
        setFormError("Your session expired. Please sign in again to place your order.");
        return;
      }

      if (res.status === 422) {
        let message = "Please review your address and cart, then try again.";
        try {
          const body = await res.json();
          if (Array.isArray(body?.details) && body.details.length > 0) {
            message = body.details.map((d: { message: string }) => d.message).join(" ");
          } else if (body?.error) {
            message = body.error;
          }
        } catch {
          // keep the friendly default
        }
        setValidationError(message);
        return;
      }

      setFormError("We couldn't place your order right now. Please try again.");
    } catch {
      setFormError("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── States (precedence: loading → success → login gate → empty → form) ──────

  if (!ready) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-16 text-charcoal/60">
          <Loader2 size={20} className="animate-spin" />
          <span>Loading checkout…</span>
        </div>
      </Shell>
    );
  }

  if (successOrderId) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-charcoal/10 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 size={48} className="text-veg" />
          <h1 className="text-2xl font-bold text-charcoal">Order placed!</h1>
          <p className="text-charcoal/70">
            Payment is coming soon — we&apos;ll confirm your order once it&apos;s ready to pay.
          </p>
          <p className="rounded-lg bg-cream px-4 py-2 font-mono text-sm text-charcoal/80">
            Order ID: {successOrderId}
          </p>
          <Link
            href="/"
            className="mt-2 rounded-full bg-navy px-6 py-3 text-sm font-bold text-cream transition-colors hover:bg-navy/90"
          >
            Back to menu
          </Link>
        </div>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-charcoal/10 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-charcoal">Sign in to check out</h1>
          <p className="text-charcoal/70">
            You need an account to place a delivery order. Your cart is saved.
          </p>
          {formError && <p className="text-sm font-medium text-nonveg">{formError}</p>}
          <button
            type="button"
            onClick={signIn}
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-navy bg-white px-6 py-3 text-sm font-semibold text-navy transition-colors hover:bg-navy hover:text-cream"
          >
            <LogIn size={18} />
            Continue with Google
          </button>
        </div>
      </Shell>
    );
  }

  if (items.length === 0) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-charcoal/10 bg-white p-8 text-center shadow-sm">
          <ShoppingCart size={40} className="text-charcoal/30" />
          <h1 className="text-2xl font-bold text-charcoal">Your cart is empty</h1>
          <p className="text-charcoal/70">Add a dish from the menu to get started.</p>
          <Link
            href="/"
            className="mt-2 rounded-full bg-navy px-6 py-3 text-sm font-bold text-cream transition-colors hover:bg-navy/90"
          >
            Browse the menu
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mb-6 text-2xl font-bold text-charcoal sm:text-3xl">Checkout</h1>

      <div className="flex flex-col gap-6">
        {/* Delivery address */}
        <section className="rounded-2xl border border-charcoal/10 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-navy">Delivery address</h2>
          <div className="flex flex-col gap-4">
            <Field
              label="Address"
              value={line1}
              onChange={setLine1}
              placeholder="House / flat, street, area"
              error={fieldErrors.line1}
              autoComplete="address-line1"
            />
            <Field
              label="City"
              value={city}
              onChange={setCity}
              placeholder="Hyderabad"
              error={fieldErrors.city}
              autoComplete="address-level2"
            />
            <Field
              label="Pincode"
              value={pincode}
              onChange={(v) => setPincode(v.replace(/\D/g, "").slice(0, 6))}
              placeholder="500001"
              error={fieldErrors.pincode}
              inputMode="numeric"
              autoComplete="postal-code"
            />
          </div>
        </section>

        {/* Order review */}
        <section className="rounded-2xl border border-charcoal/10 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-navy">Order review</h2>
          <ul className="divide-y divide-charcoal/10">
            {items.map(({ item, quantity }) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-charcoal">{item.name}</p>
                  <p className="mt-0.5 text-xs text-charcoal/60">
                    {formatPrice(item.price)} × {quantity}
                  </p>
                </div>
                <span className="text-sm font-bold text-charcoal tabular-nums">
                  {formatPrice(item.price * quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-charcoal/10 pt-4 text-base font-bold text-charcoal">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatPrice(subtotal)}</span>
          </div>
          <p className="mt-1 text-xs text-charcoal/50">
            Shown as a preview. Your final total is confirmed by our server when you place the order.
          </p>
        </section>

        {(formError || validationError) && (
          <p className="rounded-lg bg-nonveg/10 px-4 py-3 text-sm font-medium text-nonveg">
            {formError ?? validationError}
          </p>
        )}

        <button
          type="button"
          onClick={placeOrder}
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-bold text-cream transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:bg-navy/40"
        >
          {submitting && <Loader2 size={18} className="animate-spin" />}
          {submitting ? "Placing order…" : "Place order"}
        </button>
      </div>
    </Shell>
  );
}

// Page shell — centered column inside the app layout's <main>.
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-8 pb-28 md:pb-12">{children}</div>;
}

// A labelled text input with inline validation message.
function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  inputMode?: "numeric";
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-charcoal">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        className={`rounded-lg border bg-cream px-3 py-2 text-sm text-charcoal outline-none transition-colors focus:border-navy ${
          error ? "border-nonveg" : "border-charcoal/20"
        }`}
      />
      {error && <span className="text-xs font-medium text-nonveg">{error}</span>}
    </label>
  );
}
