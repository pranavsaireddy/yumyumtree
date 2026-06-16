// Realtime subscription for a single order's live status (S11).
//
// subscribeToOrder opens a Supabase Realtime channel that fires whenever the customer's own
// order row is UPDATEd, so the tracking page reflects status changes (placed → confirmed →
// preparing → …) without polling. The customer reads the row through the orders_select_own
// RLS policy (007) — Realtime respects RLS, so a foreign order delivers no events.
//
// Degraded/restored: the .subscribe callback reports channel health. SUBSCRIBED → onRestored
// (the live link is up); CHANNEL_ERROR / TIMED_OUT / CLOSED → onDegraded (the page falls back
// to interval polling). The caller toggles its poll loop off these two signals.
//
// Uses the existing anon-key browser client (lib/supabase/client.ts). It never creates a new
// client and never writes — reads via RLS, writes via the API.

import type { RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// The order row shape the page consumes from a Realtime UPDATE payload. Mirrors the columns
// the tracking UI reads (architecture §6); the payload carries the full new row.
export interface OrderRow {
  id: string;
  status: string;
  order_type: "delivery" | "dine_in";
}

export interface SubscribeCallbacks {
  onUpdate: (order: OrderRow) => void;
  onDegraded: () => void;
  onRestored: () => void;
}

// Subscribe to UPDATEs on one order. Returns an unsubscribe function that tears the channel
// down (call it on unmount).
export function subscribeToOrder(
  id: string,
  { onUpdate, onDegraded, onRestored }: SubscribeCallbacks,
): () => void {
  const supabase = createClient();

  const channel = supabase
    .channel(`order-${id}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
      (payload: RealtimePostgresUpdatePayload<OrderRow>) => onUpdate(payload.new),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onRestored();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        onDegraded();
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
