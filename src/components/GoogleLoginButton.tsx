"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function GoogleLoginButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? "リダイレクト中…" : "Googleで始める"}
      </button>
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
