// The voice routes spend ElevenLabs credits, so only our own page may call them. A request is
// accepted only when all of these hold:
//  - it was addressed to this machine by a loopback name (not the LAN address or another host)
//  - the browser did not mark it cross-site (Sec-Fetch-Site)
//  - if it carries an Origin, that Origin is this same host
// A web page on another site cannot hide its Origin, and another device on the Wi-Fi reaches us by
// a LAN address, so both are refused. curl on this machine sends neither header and still works.
type Headers = { get(name: string): string | null };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

// On a public deployment the page is served from its own address. Vercel names that address in these
// variables (one per kind of URL the same deployment can be reached by), and AIRLOCK_PUBLIC_HOST can
// name a custom domain. Only those exact hosts are accepted besides loopback.
function deployedHosts(env: Record<string, string | undefined>): Set<string> {
  const names = ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "AIRLOCK_PUBLIC_HOST"];
  return new Set(names.map((n) => env[n]?.trim().toLowerCase()).filter((v): v is string => !!v));
}

export function isSameOriginRequest(h: Headers, env: Record<string, string | undefined> = process.env): boolean {
  const host = h.get("host");
  if (!host) return false;
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];

  if (!LOOPBACK.has(hostname.toLowerCase())) {
    // A public host is held to a stricter rule than a local one: it must be one of our own deployed hosts,
    // and the request must come from a browser page on that same host (same-origin fetch with a matching Origin).
    // A bare curl, which could spend ElevenLabs credits for anyone on the internet, carries neither header.
    if (!deployedHosts(env).has(host.toLowerCase())) return false;
    if (h.get("sec-fetch-site") !== "same-origin") return false;
    const o = h.get("origin");
    if (!o) return false;
    try {
      return new URL(o).host.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  }

  const site = h.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;

  const origin = h.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}
