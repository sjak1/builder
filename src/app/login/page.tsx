"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  async function sendMagicLink(e: { preventDefault: () => void }) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-4xl mb-2">Welcome</h1>
        <p className="text-neutral-400 text-sm mb-8">
          Sign in to your AI App Builder.
        </p>

        {sent ? (
          <div className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-300">
            Check your inbox — we sent a magic link to{" "}
            <span className="text-white">{email}</span>.
          </div>
        ) : (
          <>
            <form onSubmit={sendMagicLink} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-10 px-3 rounded-lg bg-neutral-900 border border-neutral-800 text-sm focus:outline-none focus:border-neutral-600"
              />
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Sending…" : "Send magic link"}
              </Button>
            </form>

            {err && <p className="mt-4 text-xs text-red-400">{err}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
