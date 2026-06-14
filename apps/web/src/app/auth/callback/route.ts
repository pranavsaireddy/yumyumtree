// OAuth callback Route Handler (GET). Google redirects here with a `code`; we exchange it
// for a Supabase session (cookies written via the server client), then best-effort sync the
// customers row on the backend, and finally redirect home (or to a validated `next` path).
//
// Never crashes: any failure (missing code, exchange error) lands the user back on '/'.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only allow same-site relative redirects (e.g. "/menu"); reject absolute URLs and
// protocol-relative "//evil.com" to avoid an open redirect.
function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  // Sync the customer row server-side using the verified access token. Best-effort: a failure
  // here must NOT block sign-in — the upsert is idempotent and retries on the next login.
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (backend) {
    try {
      const res = await fetch(`${backend}/api/auth/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!res.ok) {
        // No pino in the web app; server-side console is the available log sink.
        console.error(`customer sync returned ${res.status} (will retry next login)`);
      }
    } catch (err) {
      console.error("customer sync request failed (will retry next login)", err);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
