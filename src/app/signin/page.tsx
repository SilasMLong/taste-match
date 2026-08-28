import type { Metadata } from "next";
import Link from "next/link";
import { authConfigured } from "@/lib/supabaseAuth";
import SignInForm from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in — Taste Match",
  description: "Keep the taste you've built across devices.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-center font-serif text-2xl text-foreground">
          Keep your taste
        </h1>
        {/* Says plainly what an account is for. Nothing here is gated behind
            it, and claiming otherwise would be a lie the deck disproves. */}
        <p className="mt-3 text-center text-sm leading-relaxed text-muted">
          Signing in carries everything you&apos;ve already swiped onto an
          account, so it survives clearing your browser and follows you to other
          devices. You can keep swiping without one.
        </p>

        <div className="mt-8">
          {authConfigured() ? (
            <SignInForm initialError={error} />
          ) : (
            <p className="text-center text-sm text-muted">
              Sign-in isn&apos;t configured on this deployment yet.
            </p>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted">
          <Link href="/" className="underline transition-colors hover:text-foreground">
            Back to swiping
          </Link>
        </p>
      </div>
    </div>
  );
}
