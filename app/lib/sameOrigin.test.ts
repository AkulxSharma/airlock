import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./sameOrigin";

const req = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe("isSameOriginRequest", () => {
  it("accepts our own page: loopback host, same-origin fetch, matching Origin", () => {
    expect(isSameOriginRequest(req({ host: "localhost:3100", "sec-fetch-site": "same-origin", origin: "http://localhost:3100" }))).toBe(true);
    expect(isSameOriginRequest(req({ host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" }))).toBe(true);
    expect(isSameOriginRequest(req({ host: "[::1]:3100", origin: "http://[::1]:3100" }))).toBe(true);
  });

  it("accepts a local tool with no browser headers (curl on this machine)", () => {
    expect(isSameOriginRequest(req({ host: "localhost:3100" }))).toBe(true);
  });

  it("refuses a request that arrived by a LAN address or another host name", () => {
    expect(isSameOriginRequest(req({ host: "10.84.77.165:3100" }))).toBe(false);
    expect(isSameOriginRequest(req({ host: "airlock.example.com" }))).toBe(false);
    expect(isSameOriginRequest(req({}))).toBe(false);
  });

  it("refuses a request another website sent from the browser", () => {
    expect(isSameOriginRequest(req({ host: "localhost:3100", origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginRequest(req({ host: "localhost:3100", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(req({ host: "localhost:3100", "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("refuses a malformed Origin and an Origin on a different port", () => {
    expect(isSameOriginRequest(req({ host: "localhost:3100", origin: "not a url" }))).toBe(false);
    expect(isSameOriginRequest(req({ host: "localhost:3100", origin: "http://localhost:4000" }))).toBe(false);
  });
});
