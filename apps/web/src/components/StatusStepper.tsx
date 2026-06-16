// StatusStepper — the live order progress rail (S11).
//
// Renders the ordered lifecycle steps for the order's type, marking each as past (check),
// current (highlighted), or upcoming (dim). The step lists MUST match the architecture §6
// status enum exactly — a typo here desyncs the stepper from the real status the backend
// writes, so the customer's progress would silently stall on a step that never arrives.
//
// Terminal states (cancelled / rejected / payment_failed / expired) are NOT steps on the rail
// — the page renders the TERMINALS copy instead of this component. TERMINALS is exported here
// so the stepper and the terminal screens stay defined in one place, in lockstep with §6.

import { Check } from "lucide-react";

const NAVY = "#0A1A3F";
const GOLD = "#D4AF37";

export type OrderType = "delivery" | "dine_in";

// Step keys are §6 status values; labels are the customer-facing copy.
interface Step {
  status: string;
  label: string;
}

// delivery: placed → confirmed → preparing → ready → dispatched → delivered
const DELIVERY_STEPS: Step[] = [
  { status: "placed", label: "Placed" },
  { status: "confirmed", label: "Confirmed" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "dispatched", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
];

// dine_in: placed → confirmed → preparing → ready → served
const DINE_IN_STEPS: Step[] = [
  { status: "placed", label: "Placed" },
  { status: "confirmed", label: "Confirmed" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "served", label: "Served" },
];

// Terminal §6 states the stepper never renders — the page shows this copy instead. Every
// terminal status in the §6 enum has an entry; a missing one would crash the terminal screen.
export const TERMINALS: Record<string, { heading: string; message: string }> = {
  cancelled: {
    heading: "Order cancelled",
    message: "This order was cancelled. If you were charged, the amount will be refunded.",
  },
  rejected: {
    heading: "Order not accepted",
    message: "Sorry — the restaurant couldn't accept this order. Any payment will be refunded.",
  },
  payment_failed: {
    heading: "Payment didn't go through",
    message: "We couldn't confirm your payment, so this order wasn't placed. You can try ordering again.",
  },
  expired: {
    heading: "Order expired",
    message: "This order expired before payment was completed. Please place a new order.",
  },
};

export function StatusStepper({ status, orderType }: { status: string; orderType: OrderType }) {
  const steps = orderType === "delivery" ? DELIVERY_STEPS : DINE_IN_STEPS;

  // Index of the current status in the rail. -1 (unknown/early status like pending_payment)
  // leaves every step "upcoming", which reads correctly as "not started yet".
  const currentIndex = steps.findIndex((s) => s.status === status);

  return (
    <ol className="flex flex-col gap-1">
      {steps.map((step, i) => {
        const isPast = currentIndex > -1 && i < currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === steps.length - 1;

        return (
          <li key={step.status} className="flex items-stretch gap-3">
            {/* marker + connector rail */}
            <div className="flex flex-col items-center">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                style={{
                  borderColor: isPast || isCurrent ? GOLD : "rgba(10,26,63,0.2)",
                  backgroundColor: isPast ? GOLD : isCurrent ? "rgba(212,175,55,0.15)" : "transparent",
                }}
                aria-hidden
              >
                {isPast ? (
                  <Check size={16} style={{ color: NAVY }} />
                ) : (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: isCurrent ? GOLD : "rgba(10,26,63,0.25)" }}
                  />
                )}
              </span>
              {!isLast && (
                <span
                  className="my-1 w-0.5 flex-1"
                  style={{ backgroundColor: isPast ? GOLD : "rgba(10,26,63,0.15)" }}
                  aria-hidden
                />
              )}
            </div>

            {/* label */}
            <div className={isLast ? "" : "pb-4"}>
              <p
                className="text-sm font-semibold leading-8"
                style={{
                  color: isCurrent ? NAVY : isPast ? NAVY : "rgba(10,26,63,0.45)",
                }}
              >
                {step.label}
                {isCurrent && (
                  <span
                    className="ml-2 rounded-full px-2 py-0.5 text-xs font-bold align-middle"
                    style={{ backgroundColor: GOLD, color: NAVY }}
                  >
                    Now
                  </span>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
