// Which museum image hosts have to be served through /api/image instead of
// being loaded straight from the museum by the browser.
//
// This is an allowlist rather than "proxy everything" on purpose: the four
// fine-art sources serve browser-loadable images in the 28-500 KB range, and
// routing 36,000 of those through our own server would spend bandwidth to
// solve a problem they don't have.
const PROXIED_HOSTS = new Set([
  // Runs Anubis proof-of-work bot protection. Serves the real JPEG to
  // non-browser clients but returns an HTML challenge page to any browser
  // User-Agent, including the exact header set an <img> tag sends. An <img>
  // can't run the challenge's JavaScript, so these 1,000 architecture images
  // cannot load directly in a browser at all -- see README's image hosting
  // gotchas.
  "architekturmuseum.ub.tu-berlin.de",
  // Loads fine in a browser, but serves 0.6-2.1 MB originals with no size
  // parameter to ask for anything smaller. Proxied purely to downscale.
  "www.parismuseescollections.paris.fr",
]);

// The URL an <img> should actually point at. Takes the image's id rather than
// passing the remote URL through a query string: an open proxy that fetches
// any URL a caller hands it is an SSRF hole, and the id makes the set of
// fetchable URLs exactly "rows in our own images table".
export function displayUrl(image: {
  id: string;
  image_url: string;
  mirror_url?: string | null;
}): string {
  // A mirrored copy wins outright: it is already the downscaled WebP the proxy
  // would have produced, served from a CDN with no function invocation and no
  // dependence on whether the museum's host will talk to us today. This is the
  // only thing that works for hosts refusing datacenter networks, where the
  // proxy fetch is blocked exactly as the browser would be.
  if (image.mirror_url) return image.mirror_url;

  let host: string;
  try {
    host = new URL(image.image_url).host;
  } catch {
    return image.image_url;
  }
  return PROXIED_HOSTS.has(host) ? `/api/image/${image.id}` : image.image_url;
}

export function isProxiedHost(imageUrl: string): boolean {
  try {
    return PROXIED_HOSTS.has(new URL(imageUrl).host);
  } catch {
    return false;
  }
}
