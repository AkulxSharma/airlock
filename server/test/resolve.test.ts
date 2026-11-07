import { describe, expect, it } from "vitest";
import { resolveTarget, type EnsClient } from "../src/api/resolve.js";

const CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const LOWER = CHECKSUMMED.toLowerCase();
const BAD_CHECKSUM = "0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"; // first letters re-cased

const client = (impl: EnsClient["getEnsAddress"]): EnsClient => ({ getEnsAddress: impl });
const neverCalled = client(async () => {
  throw new Error("ENS client should not be called");
});

describe("resolveTarget", () => {
  it("accepts a valid checksummed address", async () => {
    expect(await resolveTarget(CHECKSUMMED, neverCalled)).toEqual({ address: CHECKSUMMED });
  });

  it("accepts an all-lowercase address and returns it checksummed", async () => {
    expect(await resolveTarget(LOWER, neverCalled)).toEqual({ address: CHECKSUMMED });
  });

  it("rejects a mixed-case address with a bad checksum", async () => {
    expect("error" in (await resolveTarget(BAD_CHECKSUM, neverCalled))).toBe(true);
  });

  it("rejects a wrong-length address", async () => {
    expect("error" in (await resolveTarget("0x1234", neverCalled))).toBe(true);
    expect("error" in (await resolveTarget(CHECKSUMMED + "00", neverCalled))).toBe(true);
  });

  it("rejects non-hex characters", async () => {
    expect("error" in (await resolveTarget("0x" + "zz".repeat(20), neverCalled))).toBe(true);
  });

  it("resolves a .eth name through the client", async () => {
    const c = client(async ({ name }) => (name === "vitalik.eth" ? LOWER : null));
    expect(await resolveTarget("vitalik.eth", c)).toEqual({ address: CHECKSUMMED });
  });

  it("returns an error for an unknown ENS name", async () => {
    const c = client(async () => null);
    expect("error" in (await resolveTarget("nobody-has-this.eth", c))).toBe(true);
  });

  it("returns an error, not a crash, when the ENS lookup throws", async () => {
    const c = client(async () => {
      throw new Error("network down");
    });
    expect("error" in (await resolveTarget("vitalik.eth", c))).toBe(true);
  });

  it("returns an error for an invalid .eth name", async () => {
    expect("error" in (await resolveTarget("bad name.eth", neverCalled))).toBe(true);
  });

  it("returns an error for empty or unrecognised input", async () => {
    expect("error" in (await resolveTarget("", neverCalled))).toBe(true);
    expect("error" in (await resolveTarget("   ", neverCalled))).toBe(true);
    expect("error" in (await resolveTarget("hello world", neverCalled))).toBe(true);
  });

  it("trims whitespace around the input", async () => {
    expect(await resolveTarget(`  ${CHECKSUMMED}  `, neverCalled)).toEqual({ address: CHECKSUMMED });
  });
});
