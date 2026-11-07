// The voice routes spend ElevenLabs credits, so only our own page may call them. A request is
// accepted only when all of these hold:
//  - it was addressed to this machine by a loopback name (not the LAN address or another host)
//  - the browser did not mark it cross-site (Sec-Fetch-Site)
//  - if it carries an Origin, that Origin is this same host
// A web page on another site cannot hide its Origin, and another device on the Wi-Fi reaches us by
// a LAN address, so both are refused. curl on this machine sends neither header and still works.
type Headers = { get(name: string): string | null };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isSameOriginRequest(h: Headers): boolean {
  const host = h.get("host");
  if (!host) return false;
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  if (!LOOPBACK.has(hostname.toLowerCase())) return false;

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
