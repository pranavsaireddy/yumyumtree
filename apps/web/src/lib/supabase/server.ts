// Server Supabase client (@supabase/ssr) wired to Next's async cookies() — used by the
// auth callback Route Handler to exchange the OAuth code for a session and persist it.
// Anon key only; the service-role key never exists in the frontend.
//
// v0.12 cookie API: getAll/setAll (the get/set/remove trio is deprecated). Verified against
// the installed package types (dist/module/types.d.ts → CookieMethodsServer).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll throws when called from a Server Component (cookies are read-only there).
            // The callback Route Handler — the only place we exchange a code — CAN write
            // cookies, so the session is persisted there. S6 gates nothing server-side and
            // adds no middleware, so there's nothing else to refresh here.
          }
        },
      },
    },
  );
}
