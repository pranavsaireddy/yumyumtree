"use client";

// /track/[orderId] — live order tracking (S11). CLIENT COMPONENT.
//
// READS VIA RLS, NEVER WRITES. The order is read directly through the Supabase browser client
// (anon key) using the orders_select_own policy (migration 007) — there is no GET /api/orders/
// :id route, and there should not be: this page is the proof that direct RLS reads are safe.
// The policy scopes the row to the logged-in customer (customer_id = auth.uid()) automatically.
//
// Three consequences of reading through RLS, all handled below:
//   • AUTH REQUIRED — the policy is TO authenticated; with no session the select returns zero
//     rows. A logged-out visitor on a tracking link is sent through Google sign-in (back to
//     this page), NOT shown a misleading "not found".
//   • NOT-FOUND == NOT-YOURS — RLS returns zero rows BOTH for a nonexistent order AND for one
//     belonging to another customer. We deliberately do NOT distinguish them: a single "order
//     not found" screen keeps a foreign order invisible (we never leak its existence).
//   • LIVE UPDATES — subscribeToOrder streams UPDATEs (Realtime also respects RLS). If the live
//     link degrades we fall back to a 15s poll that re-runs the SAME RLS select.

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToOrder, type OrderRow } from "@/lib/realtime";
import { StatusStepper, TERMINALS, type OrderType } from "@/components/StatusStepper";

const NAVY = "#0A1A3F";
const GOLD = "#D4AF37";
const CREAM = "#FFF9F0";

const POLL_INTERVAL_MS = 15000;
// Only the columns the tracking UI needs — id for the channel filter, status + order_type for
// the stepper. No prices, no address; this is a status screen, not an order summary (S20).
const ORDER_COLUMNS = "id, status, order_type";

type Phase = "loading" | "needAuth" | "notFound" | "ready";

export default function TrackOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);

  const [phase, setPhase] = useState<Phase>("loading");
  const [order, setOrder] = useState<OrderRow | null>(null);
  // false = live Realtime link; true = fell back to interval polling (drives the pill).
  const [degraded, setDegraded] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Re-run the SAME RLS select used for the initial load. Shared by the degraded poll loop.
  // Only updates on a real row; a transient zero-row read never flips a loaded order away.
  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", orderId)
      .maybeSingle();
    if (!error && data) setOrder(data as OrderRow);
  }, [orderId]);

  // Initial load: require a session, then read the order via RLS.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        setPhase("needAuth");
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("id", orderId)
        .maybeSingle();
      if (cancelled) return;

      // Zero rows (nonexistent OR foreign) and any read error land on the same friendly screen.
      if (error || !data) {
        setPhase("notFound");
        return;
      }

      setOrder(data as OrderRow);
      setPhase("ready");
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Live subscription — only once the order has loaded. Degraded → start polling; restored →
  // stop. Cleans up the channel AND any poll interval on unmount.
  useEffect(() => {
    if (phase !== "ready") return;

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const unsubscribe = subscribeToOrder(orderId, {
      onUpdate: (o) => setOrder((prev) => (prev ? { ...prev, ...o } : o)),
      onDegraded: () => {
        setDegraded(true);
        if (!pollRef.current) {
          pollRef.current = setInterval(() => void refetch(), POLL_INTERVAL_MS);
        }
      },
      onRestored: () => {
        setDegraded(false);
        stopPolling();
      },
    });

    return () => {
      unsubscribe();
      stopPolling();
    };
  }, [phase, orderId, refetch]);

  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // Land back on this tracking page after the callback exchanges the code (safeNext-validated).
      options: { redirectTo: `${location.origin}/auth/callback?next=/track/${orderId}` },
    });
  }

  // ── States: loading → needAuth → notFound → terminal → live stepper ──────────

  if (phase === "loading") {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-16" style={{ color: "rgba(10,26,63,0.6)" }}>
          <Loader2 size={20} className="animate-spin" />
          <span>Loading your order…</span>
        </div>
      </Shell>
    );
  }

  if (phase === "needAuth") {
    return (
      <Shell>
        <Card>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Sign in to track your order
          </h1>
          <p style={{ color: "rgba(10,26,63,0.7)" }}>
            Please sign in with the account you used to place this order.
          </p>
          <button
            type="button"
            onClick={signIn}
            className="mt-2 inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition-colors"
            style={{ borderColor: NAVY, color: NAVY, backgroundColor: "white" }}
          >
            <LogIn size={18} />
            Continue with Google
          </button>
        </Card>
      </Shell>
    );
  }

  if (phase === "notFound" || !order) {
    return (
      <Shell>
        <Card>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Order not found
          </h1>
          <p style={{ color: "rgba(10,26,63,0.7)" }}>
            We couldn&apos;t find this order on your account. Check the link, or sign in with the
            account you ordered from.
          </p>
          <BackToMenu />
        </Card>
      </Shell>
    );
  }

  const terminal = TERMINALS[order.status];
  if (terminal) {
    return (
      <Shell>
        <Card>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            {terminal.heading}
          </h1>
          <p style={{ color: "rgba(10,26,63,0.7)" }}>{terminal.message}</p>
          <BackToMenu />
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
          Tracking your order
        </h1>
        <ConnectionPill degraded={degraded} />
      </div>
      <p className="mt-1 font-mono text-xs" style={{ color: "rgba(10,26,63,0.5)" }}>
        Order ID: {order.id}
      </p>

      <div
        className="mt-6 rounded-2xl border bg-white p-6 shadow-sm"
        style={{ borderColor: "rgba(10,26,63,0.1)" }}
      >
        <StatusStepper status={order.status} orderType={order.order_type as OrderType} />
      </div>

      <BackToMenu />
    </Shell>
  );
}

// Live-connection indicator. Green dot + "Live" when subscribed; amber pulse +
// "Refreshing periodically" when the Realtime link degraded and we're polling.
function ConnectionPill({ degraded }: { degraded: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        backgroundColor: degraded ? "rgba(212,175,55,0.15)" : "rgba(34,197,94,0.12)",
        color: degraded ? "#8A6D1B" : "#15803D",
      }}
    >
      <span
        className={`h-2 w-2 rounded-full ${degraded ? "animate-pulse" : ""}`}
        style={{ backgroundColor: degraded ? GOLD : "#22C55E" }}
        aria-hidden
      />
      {degraded ? "Refreshing periodically" : "Live"}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: CREAM }}>
      <div className="mx-auto max-w-2xl px-4 py-8 pb-28 md:pb-12">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-2xl border bg-white p-8 text-center shadow-sm"
      style={{ borderColor: "rgba(10,26,63,0.1)" }}
    >
      {children}
    </div>
  );
}

function BackToMenu() {
  return (
    <Link
      href="/"
      className="mt-4 inline-block rounded-full px-6 py-3 text-sm font-bold transition-opacity hover:opacity-90"
      style={{ backgroundColor: NAVY, color: CREAM }}
    >
      Back to menu
    </Link>
  );
}
