"use client";

import { useState } from "react";
import Loader from "@/components/Loader";
import { createClientSupabase } from "@/lib/supabaseBrowser";

type Status = "idle" | "redirecting" | "sending" | "sent" | "error";

export default function SignInForm({ initialError }: { initialError?: string }) {
  const [status, setStatus] = useState<Status>(initialError ? "error" : "idle");
  const [message, setMessage] = useState(initialError ?? "");
  const [email, setEmail] = useState("");

  const callbackUrl = () => `${window.location.origin}/auth/callback`;

  async function signInWithGoogle() {
    setStatus("redirecting");
    const supabase = createClientSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    }
    // On success the browser navigates away, so there is nothing to do here.
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    const supabase = createClientSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="text-center">
        <p className="font-serif text-lg text-foreground">Check your email</p>
        <p className="mt-2 text-sm text-muted">
          A sign-in link is on its way to {email}. It expires shortly, so use it soon.
        </p>
      </div>
    );
  }

  if (status === "redirecting") {
    return <Loader label="Redirecting" />;
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={signInWithGoogle}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm text-foreground transition-colors hover:bg-[#f2f0ec]"
      >
        {/* Google's mark, inlined rather than loaded from their CDN -- an
            external request here would leak that this page was visited. */}
        <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.4c-.5 2.9-2.1 5.4-4.6 7l7.6 5.9c4.4-4.1 6.7-10.2 6.7-17.2z" />
          <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.3 0 20 0 24s1 7.7 2.6 10.8l7.8-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.4 0-11.7-3.7-13.6-8.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-widest text-muted">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={sendMagicLink} className="space-y-3">
        <label htmlFor="email" className="block text-sm text-muted">
          Email a sign-in link
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-foreground"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-md border border-foreground bg-foreground px-4 py-3 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Send link"}
        </button>
      </form>

      {status === "error" && (
        <p className="mt-4 text-center text-sm text-muted">
          {message || "That didn't work. Try again."}
        </p>
      )}
    </div>
  );
}
