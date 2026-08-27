// Shared values for the privacy policy and terms pages.
//
// Google's OAuth consent screen requires a reachable home page, privacy policy
// and terms of service on the app's own domain, and checks that they load.

// TODO(silas): replace with the address you want to receive these at -- the
// Google Group made for the OAuth support email is the obvious candidate, since
// it keeps a personal inbox off a public page. Both legal pages read from here,
// so it is a one-line change.
export const CONTACT_EMAIL = "REPLACE_ME@googlegroups.com";

export const SITE_NAME = "Taste Match";
// The canonical origin. Vercel keeps serving the .vercel.app address too, but
// this is the one to use in metadata, OAuth configuration and anything shared.
export const SITE_URL = "https://tastematch.studio";

// Bump when the substance changes, not for typo fixes.
export const LAST_UPDATED = "26 August 2026";
