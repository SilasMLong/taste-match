import type { Metadata } from "next";
import { CONTACT_EMAIL, LAST_UPDATED, SITE_NAME } from "../legal";

export const metadata: Metadata = {
  title: `Privacy — ${SITE_NAME}`,
  description: `What ${SITE_NAME} stores about you, and what it doesn't.`,
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl text-foreground">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Last updated {LAST_UPDATED}</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground sm:text-base">
        <section>
          <p>
            {SITE_NAME} shows you artwork and remembers which pieces you liked so
            it can show you more like them. That is the only reason it stores
            anything. This page describes exactly what is kept.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">What is stored</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>
              <span className="text-foreground">Your swipes.</span> For each
              piece you like or pass on, we store which piece it was, which way
              you swiped, when, and a copy of that piece&apos;s descriptive tags.
              This is what the recommendations are built from.
            </li>
            <li>
              <span className="text-foreground">An anonymous identifier.</span> A
              randomly generated ID stored in a cookie, so your swipes stay
              associated with you between visits. It is not derived from
              anything about you or your device — it is a random number.
            </li>
            <li>
              <span className="text-foreground">
                An email address, only if you sign in.
              </span>{" "}
              Signing in is optional. If you do, we store the email address and
              account identifier your sign-in provider gives us, so your taste
              profile can follow you to another browser or device.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-xl">What is not stored</h2>
          <p className="mt-3 text-muted">
            There are no analytics, no advertising, no tracking pixels and no
            third-party scripts of any kind on this site. Your data is never
            sold, rented or shared for marketing. There is no profile of you
            beyond the artwork you have swiped on. If you never sign in, we do
            not know your name, your email address, or who you are.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Cookies</h2>
          <p className="mt-3 text-muted">
            Two kinds, both strictly necessary — there are no optional or
            advertising cookies to consent to:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>
              An anonymous session cookie, set on your first visit and kept for
              a year, which is how your swipes are remembered.
            </li>
            <li>
              If you sign in, authentication cookies that keep you signed in.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-xl">Who else handles it</h2>
          <p className="mt-3 text-muted">
            The site runs on Vercel, which hosts it and keeps standard server
            request logs. Data is stored in a Supabase database, which also
            handles sign-in. If you choose to sign in with Google, Google
            confirms your identity to us and tells us your email address. Each
            of these providers handles data under its own privacy policy.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Deleting your data</h2>
          <p className="mt-3 text-muted">
            If you have not signed in, clearing this site&apos;s cookies in your
            browser permanently disconnects you from your swipe history — a new
            anonymous identifier is issued on your next visit, and the old
            records are no longer reachable by anyone, including us.
          </p>
          <p className="mt-3 text-muted">
            If you have an account and want it and its history deleted, email{" "}
            <a className="text-foreground underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{" "}
            and it will be done. You can also ask for a copy of what is stored
            about you.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">The artwork</h2>
          <p className="mt-3 text-muted">
            Images come from the open-access collections of the Metropolitan
            Museum of Art, the Smithsonian, the Cleveland Museum of Art, the Art
            Institute of Chicago, and institutions publishing through Europeana.
            They are public domain or openly licensed. This site is not
            affiliated with, endorsed by, or operated by any of them.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Children</h2>
          <p className="mt-3 text-muted">
            This site is not directed at children under 13 and does not
            knowingly collect information from them.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Changes</h2>
          <p className="mt-3 text-muted">
            If what is collected changes, this page changes with it and the date
            at the top is updated.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Contact</h2>
          <p className="mt-3 text-muted">
            Questions about any of this go to{" "}
            <a className="text-foreground underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
