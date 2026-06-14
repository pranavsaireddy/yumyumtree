// Browser Supabase client (@supabase/ssr) for Client Components — the AuthButton island
// uses this for signInWithOAuth / signOut / onAuthStateChange. Reads the public anon key
// only; the service-role key never exists in the frontend.
//
// With no `cookies` option configured, the browser client manages its own session via
// document.cookie (the v0.12 default) — which is what the server callback route writes to.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
