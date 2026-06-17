import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";
import { loadE2EEnv } from "./env";

loadE2EEnv();

export const TEST_EMAIL = "test_e2e@yumyumtree.local";
// Must match seed-test-user.js (same env var, same default).
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "e2e-Test-Password-1!";

interface CapturedCookie {
  name: string;
  value: string;
}

// Sign the E2E user in with email/password via @supabase/ssr's SERVER client, capturing the exact
// auth cookies the library serializes (the chunked, base64 `sb-<ref>-auth-token` shape). Because
// this server client and the app's browser client (src/lib/supabase/client.ts) are BOTH
// @supabase/ssr with the SAME project URL, the cookies captured here are byte-for-byte what the
// browser client reads back — no hand-rolled cookie format to drift. We then inject them into the
// Playwright context so the app loads already authenticated, with a real Supabase session in
// COOKIES and no Google OAuth UI.
export async function signInTestUser(context: BrowserContext): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "signInTestUser: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set",
    );
  }

  const captured: CapturedCookie[] = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => captured.map((c) => ({ name: c.name, value: c.value })),
      setAll: (cookies) => {
        for (const c of cookies) {
          const existing = captured.find((x) => x.name === c.name);
          if (existing) existing.value = c.value;
          else captured.push({ name: c.name, value: c.value });
        }
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) throw new Error(`signInTestUser: sign-in failed — ${error.message}`);
  if (captured.length === 0) {
    throw new Error("signInTestUser: supabase client wrote no auth cookies");
  }

  await context.addCookies(
    captured.map((c) => ({
      name: c.name,
      value: c.value,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
  );
}
