import { test, expect } from "@playwright/test";

// A LOGGED-OUT visitor hits /checkout. The login gate is CLIENT-SIDE (T-013): the server does NOT
// redirect (there is no /login route). The page renders an in-browser sign-in gate. We assert the
// gate appears, that we are still on /checkout (no redirect), and that the authed checkout form is
// absent. The default `page` fixture has no auth cookies, so it is logged out.
test("logged-out checkout shows the client-side sign-in gate (no /login redirect)", async ({
  page,
}) => {
  await page.goto("/checkout");

  await expect(page.getByRole("heading", { name: "Sign in to check out" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();

  // Still on /checkout — the gate is client-side, not a navigation to a login route.
  expect(new URL(page.url()).pathname).toBe("/checkout");

  // The authed checkout form must NOT be present.
  await expect(page.getByRole("heading", { name: "Delivery address" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Place order" })).toHaveCount(0);
});
