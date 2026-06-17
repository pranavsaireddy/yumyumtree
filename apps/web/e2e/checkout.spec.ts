import { test, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import { resolve } from "path";
import { signInTestUser } from "./helpers/auth";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

// Two stable, uniquely-named seeded menu items (apps/api/src/mocks/petpooja/menu.js), identified in
// the UI by their exact card heading text. Chosen for unique names (no substring clashes with other
// items) and a trivially-checkable total: ₹99 + ₹100 = ₹199 → 19900 paise.
const ITEM_A = "French Fries"; // item_french_fries, ₹99
const ITEM_B = "Gulab Jamun"; // item_gulab_jamun, ₹100

// Stub Razorpay defensively before any app code runs. The current /checkout shows "payment coming
// soon" and never constructs window.Razorpay, but if it is ever wired this guarantees the real modal
// never opens during E2E (options captured on window.__razorpayOptions; open() is a no-op). We do
// NOT assert it was called — the present flow legitimately never opens it.
const STUB_RAZORPAY = `
  window.Razorpay = function (options) {
    window.__razorpayOptions = options;
    return { open: function () {}, on: function () {}, close: function () {} };
  };
`;

test("critical path: menu → cart → checkout → simulated webhook → tracking reaches Placed", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    geolocation: { latitude: 17.385, longitude: 78.4867 }, // Hyderabad
    permissions: ["geolocation"],
  });
  await signInTestUser(context);

  const page = await context.newPage();
  await page.addInitScript(STUB_RAZORPAY);

  // 1. Menu → add the two fixture items via the real per-card "Add" control.
  await page.goto("/");
  for (const name of [ITEM_A, ITEM_B]) {
    const card = page.locator("article", { hasText: name });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Add", exact: true }).click();
  }

  // 2. Checkout (authenticated; cart carried by the persisted store). The address form renders only
  //    when authed AND the cart is non-empty, so its heading proves both.
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  await page.getByLabel("Address").fill("12-3-456 Test Street, Mandi");
  await page.getByLabel("City").fill("Hyderabad");
  await page.getByLabel("Pincode").fill("500001");

  // 3. Place the order; read order_id from the intercepted POST /api/orders response.
  const orderResponsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/orders") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Place order" }).click();
  const orderResponse = await orderResponsePromise;
  expect(orderResponse.status()).toBe(201);
  const { order_id: orderId } = (await orderResponse.json()) as { order_id: string };
  expect(orderId).toBeTruthy();

  // The page confirms creation (order is still pending_payment until the webhook fires).
  await expect(page.getByText("Order placed!")).toBeVisible();

  // 4. Simulate the Razorpay payment.captured webhook → confirm_order → status 'placed'.
  const simulator = resolve(__dirname, "../../api/scripts/simulate-razorpay-webhook.js");
  try {
    const out = execFileSync("node", [simulator, "--order", orderId], {
      env: process.env,
      encoding: "utf8",
    });
    expect(out).toContain("→ 200");
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    throw new Error(`webhook simulator failed:\n${e.stdout ?? ""}\n${e.stderr ?? ""}`);
  }

  // 5. Track the order → the stepper's "Placed" step becomes current (its "Now" badge). Web-first
  //    polling assertion (no fixed sleep); the generous timeout covers webhook → DB → RLS-read lag.
  await page.goto(`/track/${orderId}`);
  const placedStep = page.locator("li", { hasText: "Placed" });
  await expect(placedStep.getByText("Now")).toBeVisible({ timeout: 20_000 });

  await context.close();
});
