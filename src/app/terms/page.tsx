import type { Metadata } from "next";
import { CONTACT_EMAIL, LAST_UPDATED, SITE_NAME } from "../legal";

export const metadata: Metadata = {
  title: `Terms — ${SITE_NAME}`,
  description: `The terms for using ${SITE_NAME}.`,
};

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl text-foreground">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">Last updated {LAST_UPDATED}</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground sm:text-base">
        <section>
          <p>
            {SITE_NAME} is a free site for browsing artwork from museum
            open-access collections and building a sense of your own visual
            taste. Using it means accepting what follows.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">The service</h2>
          <p className="mt-3 text-muted">
            It is free, provided as-is, and offered with no guarantee of
            availability. It may change, break, or be discontinued at any time,
            without notice. It is a personal project rather than a commercial
            product, and should not be relied on as a system of record for
            anything.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Accounts</h2>
          <p className="mt-3 text-muted">
            An account is optional — the site works fully without one. If you
            create one, you are responsible for the security of the sign-in
            method you use. You may ask for your account and its data to be
            deleted at any time. Accounts may be removed if they are used to
            abuse or disrupt the service.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Acceptable use</h2>
          <p className="mt-3 text-muted">
            Do not attempt to disrupt the service, gain access to data that is
            not yours, or scrape it in bulk. The museum collections behind this
            site publish their own APIs; use those directly rather than putting
            load on this one.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">The artwork</h2>
          <p className="mt-3 text-muted">
            All images come from the open-access collections of the Metropolitan
            Museum of Art, the Smithsonian, the Cleveland Museum of Art, the Art
            Institute of Chicago, and institutions publishing through Europeana.
            They are public domain or openly licensed by those institutions.
            {" "}
            {SITE_NAME} claims no ownership of them, and is not affiliated with,
            endorsed by, or operated by any of those institutions. Descriptive
            information is reproduced from their catalogues and may contain
            errors that are theirs rather than ours.
          </p>
          <p className="mt-3 text-muted">
            If you hold rights in something shown here and believe it should not
            be, write to{" "}
            <a className="text-foreground underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{" "}
            and it will be removed.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Your data</h2>
          <p className="mt-3 text-muted">
            What is stored and why is set out in the{" "}
            <a className="text-foreground underline" href="/privacy">
              privacy policy
            </a>
            . In short: the artwork you swipe on, an anonymous identifier, and
            an email address only if you choose to sign in.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Liability</h2>
          <p className="mt-3 text-muted">
            To the fullest extent the law allows, {SITE_NAME} is provided
            without warranties of any kind, and its operator is not liable for
            any loss arising from its use or unavailability — including loss of
            the swipe history it stores, which is not backed up on your behalf.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Changes</h2>
          <p className="mt-3 text-muted">
            These terms may change. The date at the top reflects the most recent
            revision, and continuing to use the site means accepting the current
            version.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Contact</h2>
          <p className="mt-3 text-muted">
            <a className="text-foreground underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>
      </div>
    </article>
  );
}
