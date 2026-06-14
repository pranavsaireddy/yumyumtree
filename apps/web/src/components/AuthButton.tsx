"use client";

// Header auth island (desktop + mobile), rendered alongside <CartButton /> inside the
// server-component Header. Logged out → "Sign in" (Google OAuth). Logged in → the user's
// name/email + "Sign out". Auth state is read via the browser Supabase client and kept live
// with onAuthStateChange, so it reflects login/logout without a full reload.
//
// S6 gates nothing — this is the auth capability only. The checkout gate lands in S8.

import { useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

function displayName(user: User): string {
  const meta = user.user_metadata ?? {};
  return (meta.full_name as string) || (meta.name as string) || user.email || "Account";
}

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
  }

  // Avoid a flash of the wrong state before the first auth check resolves.
  if (!ready) {
    return <div className="h-9 w-24" aria-hidden />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="hidden max-w-[10rem] truncate text-sm font-medium text-cream/90 sm:inline"
          title={user.email ?? undefined}
        >
          {displayName(user)}
        </span>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex items-center gap-2 rounded-full border border-gold/40 px-4 py-2 text-sm font-semibold text-gold transition-colors hover:bg-white/5"
        >
          <LogOut size={18} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={signIn}
      className="inline-flex items-center gap-2 rounded-full border border-gold/40 px-4 py-2 text-sm font-semibold text-gold transition-colors hover:bg-white/5"
    >
      <LogIn size={18} />
      Sign in
    </button>
  );
}
