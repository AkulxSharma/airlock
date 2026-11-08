import { describe, expect, it, vi } from "vitest";
import { auditAddress, type ChainReader } from "../src/auditor/chain.js";
import { FINDING_IDS } from "../src/auditor/checks.js";
import { UNVERIFIED_SOURCE, analyzeSource, createSourcifyFetcher, type SourceFetcher } from "../src/auditor/source.js";
import { cleanRuntime, drainerRuntime } from "../src/demo/bytecode.js";
import { createMessageHandler } from "../src/api/message.js";
import { createConfirmStore } from "../src/gate/confirm.js";
import { decide } from "../src/gate/decide.js";

const ids = (src: string) => analyzeSource({ "A.sol": src }).map((f) => f.id);

const PHISHY = `contract Wallet { address owner;
  function transfer(address to, uint amt) public { require(tx.origin == owner); to.transfer(amt); } }`;
const SWEEP = `contract Pool { address owner;
  modifier onlyOwner() { require(msg.sender == owner); _; }
  function withdrawAll() external onlyOwner { payable(owner).transfer(address(this).balance); } }`;
const SWEEP_NO_MODIFIER = `contract Pool { address owner;
  function rescue() external { require(msg.sender == owner, "no"); (bool ok,) = owner.call{value: address(this).balance}(""); require(ok); } }`;
const TOKEN_SWEEP = `contract Vault { IERC20 token; address owner;
  function sweepTokens() external onlyOwner { token.transfer(owner, token.balanceOf(address(this))); } }`;
const RUG = `contract Tok {
  function mint(address to, uint a) external onlyOwner { _mint(to, a); }
  function setBuyFee(uint f) external onlyOwner { buyFee = f; }
  function addToBlacklist(address a) external onlyOwner { blacklist[a] = true; }
  function pause() external onlyOwner { paused = true; } }`;
const FINE_VAULT = `contract Vault { mapping(address => uint) public balanceOf;
  function deposit() external payable { balanceOf[msg.sender] += msg.value; }
  function withdraw(uint wad) external { require(balanceOf[msg.sender] >= wad); balanceOf[msg.sender] -= wad; payable(msg.sender).transfer(wad); } }`;

describe("analyzeSource", () => {
  it("flags tx.origin used for authorization", () => {
    expect(ids(PHISHY)).toEqual(["tx-origin"]);
    expect(ids("function f() { if (tx.origin != owner) revert(); }")).toEqual(["tx-origin"]);
    expect(ids("function f() { assert(owner == tx.origin); }")).toEqual(["tx-origin"]);
  });

  it("ignores tx.origin in comments and strings", () => {
    expect(ids("// require(tx.origin == owner)\ncontract A {}")).toEqual([]);
    expect(ids("/* tx.origin == owner */ contract A {}")).toEqual([]);
    expect(ids('contract A { string s = "if (tx.origin == owner)"; }')).toEqual([]);
    expect(ids('contract A { string u = "http://x.io"; function f() {} } // tx.origin == a')).toEqual([]);
  });

  it("flags an owner-only function that sends the whole ether balance", () => {
    expect(ids(SWEEP)).toEqual(["owner-sweep"]);
    expect(ids(SWEEP_NO_MODIFIER)).toEqual(["owner-sweep"]);
  });

  it("flags an owner-only function that sweeps the whole token balance", () => {
    expect(ids(TOKEN_SWEEP)).toEqual(["owner-sweep"]);
  });

  it("does not flag a user withdrawing their own balance", () => {
    expect(ids(FINE_VAULT)).toEqual([]);
  });

  it("does not flag an unguarded function that reads the balance", () => {
    expect(ids("contract A { function bal() external view returns (uint) { return address(this).balance; } }")).toEqual([]);
  });

  it("flags owner mint, adjustable fee, blacklist and pause", () => {
    expect(ids(RUG).sort()).toEqual(["adjustable-fee", "blacklist-switch", "owner-mint", "pause-switch"]);
  });

  it("an unguarded public mint is not reported as owner-only", () => {
    expect(ids("contract A { function mint(address to) external { _mint(to, 1); } }")).not.toContain("owner-mint");
  });

  it("skips interface and abstract declarations that have no body", () => {
    expect(ids("interface I { function setFee(uint) external; function pause() external; function mint(address) external; }")).toEqual([]);
  });

  it("handles modifiers with arguments in the header", () => {
    expect(ids("contract A { function withdrawAll() external onlyRole(ADMIN_ROLE) returns (bool) { payable(msg.sender).transfer(address(this).balance); return true; } }")).toEqual(["owner-sweep"]);
  });

  it("looks across every file of a multi-file source", () => {
    const f = analyzeSource({ "A.sol": FINE_VAULT, "B.sol": PHISHY });
    expect(f.map((x) => x.id)).toEqual(["tx-origin"]);
  });

  it("each finding appears once even if several functions match", () => {
    const src = "contract A { function setFee(uint a) external {} function setTax(uint a) external {} function updateFees(uint a) external {} }";
    const f = analyzeSource({ "A.sol": src });
    expect(f.map((x) => x.id)).toEqual(["adjustable-fee"]);
    expect(f[0].message).toContain("setFee");
  });

  it("every finding is labelled as a heuristic and avoids reassuring words", () => {
    const all = [PHISHY, SWEEP, RUG].flatMap((s) => analyzeSource({ "A.sol": s }));
    expect(all.length).toBeGreaterThan(5);
    for (const f of all) {
      expect(f.message).toMatch(/^Heuristic:/);
      expect(f.message).not.toMatch(/\b(safe|secure|trusted)\b/i);
    }
  });

  it("untrusted function names can not smuggle text or a reassuring word into a message", () => {
    const f = analyzeSource({
      "A.sol": "contract A { function setFeeSafe() external {} function setFee() external {} function setTax$(uint a) external {} }",
    });
    expect(f[0].message).toContain("setFee");
    expect(f[0].message).not.toMatch(/safe/i);
    const long = analyzeSource({ "A.sol": `contract A { function setFee${"x".repeat(80)}() external {} }` });
    expect(long[0].message).not.toContain("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  });

  it("every id it can produce is in FINDING_IDS", () => {
    const seen = new Set([PHISHY, SWEEP, RUG].flatMap((s) => analyzeSource({ "A.sol": s }).map((f) => f.id)));
    for (const id of seen) expect(FINDING_IDS).toContain(id);
    expect(FINDING_IDS).toContain("unverified-source");
    expect(FINDING_IDS).toContain("source-unavailable");
  });
});

describe("Sourcify fetcher", () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  const run = (f: ReturnType<typeof reply>) => createSourcifyFetcher(f as unknown as typeof fetch, 1_000)("0xabc", 11155111);

  it("returns the source files of a verified contract", async () => {
    const f = reply(200, { sources: { "A.sol": { content: "contract A {}" }, "B.sol": { content: "contract B {}" } }, match: "match" });
    expect(await run(f)).toEqual({ status: "verified", sources: { "A.sol": "contract A {}", "B.sol": "contract B {}" } });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://sourcify.dev/server/v2/contract/11155111/0xabc?fields=sources");
  });

  it("a 404 means no verified source", async () => {
    expect(await run(reply(404, { match: null }))).toEqual({ status: "none" });
  });

  it("other statuses, bad JSON, a wrong shape and network errors are errors, not 'none'", async () => {
    expect((await run(reply(500, "oops"))).status).toBe("error");
    expect((await run(reply(200, "not json"))).status).toBe("error");
    expect((await run(reply(200, { nothing: true }))).status).toBe("error");
    const down = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    expect((await run(down as unknown as ReturnType<typeof reply>)).status).toBe("error");
  });

  it("verified but with no readable files is treated as none", async () => {
    expect(await run(reply(200, { sources: { "A.sol": {} } }))).toEqual({ status: "none" });
  });

  it("a huge source is an error, not an out-of-memory", async () => {
    const big = "x".repeat(400_000);
    expect((await run(reply(200, { sources: { "A.sol": { content: big }, "B.sol": { content: big } } }))).status).toBe("error");
  });
});

describe("auditAddress with a source fetcher", () => {
  const ADDR = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
  const ZERO = "0x" + "00".repeat(32);
  const reader = (code: string | undefined): ChainReader => ({ getCode: async () => code, getStorageAt: async () => ZERO });
  const fetcher = (r: Awaited<ReturnType<SourceFetcher>>) => vi.fn<SourceFetcher>(async () => r);

  it("verified source with tx.origin adds that finding to the bytecode result", async () => {
    const f = fetcher({ status: "verified", sources: { "A.sol": PHISHY } });
    const r = await auditAddress(ADDR, reader("0x" + cleanRuntime), 2_000, f);
    expect("findings" in r && r.findings.map((x) => x.id)).toEqual(["tx-origin"]);
    expect("verdict" in r && r.verdict).toBe("MEDIUM");
  });

  it("no verified source adds unverified-source (MEDIUM)", async () => {
    const r = await auditAddress(ADDR, reader("0x" + cleanRuntime), 2_000, fetcher({ status: "none" }));
    expect("findings" in r && r.findings).toEqual([UNVERIFIED_SOURCE]);
    expect("verdict" in r && r.verdict).toBe("MEDIUM");
  });

  it("a failed lookup adds source-unavailable, and the bytecode checks still run", async () => {
    const r = await auditAddress(ADDR, reader("0x" + drainerRuntime), 2_000, fetcher({ status: "error", reason: "down" }));
    expect("findings" in r && r.findings.map((x) => x.id).sort()).toEqual(["selfdestruct", "source-unavailable"]);
    expect("verdict" in r && r.verdict).toBe("HIGH");
  });

  it("a plain wallet (no code) ignores the source lookup entirely", async () => {
    const r = await auditAddress(ADDR, reader(undefined), 2_000, fetcher({ status: "none" }));
    expect("findings" in r && r.findings.map((x) => x.id)).toEqual(["no-code"]);
    const r2 = await auditAddress(ADDR, reader("0x"), 2_000, fetcher({ status: "error", reason: "x" }));
    expect("findings" in r2 && r2.findings.map((x) => x.id)).toEqual(["no-code"]);
  });

  it("without a fetcher the result is the same as before", async () => {
    const r = await auditAddress(ADDR, reader("0x" + cleanRuntime), 2_000);
    expect("findings" in r && r.findings).toEqual([]);
  });

  it("a hanging source lookup becomes a timeout, which the gate refuses", async () => {
    const hang = vi.fn<SourceFetcher>(() => new Promise(() => {}));
    const r = await auditAddress(ADDR, reader("0x" + cleanRuntime), 30, hang);
    expect(r).toEqual({ timeout: true });
    expect(decide(r).action).toBe("refuse");
  });

  it("a source finding can never turn a bytecode HIGH into something lower", async () => {
    const r = await auditAddress(ADDR, reader("0x" + drainerRuntime), 2_000, fetcher({ status: "verified", sources: { "A.sol": FINE_VAULT } }));
    expect("verdict" in r && r.verdict).toBe("HIGH");
    expect(decide(r).action).toBe("refuse");
  });
});

describe("the source stage in the message handler", () => {
  const ADDR = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
  const run = async (audit: object) => {
    const handle = createMessageHandler({
      resolve: async () => ({ address: ADDR as `0x${string}` }),
      audit: async () => audit as never,
      store: createConfirmStore(),
      wallet: null,
      now: () => 1,
      maxTransferEth: "0.01",
      publish: () => {},
    });
    const r = await handle({ sessionId: "s", channel: "gui", text: "send 0.001 to x.eth" });
    return r.stages.find((s) => s.name === "source");
  };
  const base = { target: ADDR, chainId: 11155111, riskScore: 0 };
  const f = (id: string) => ({ id, severity: "medium" as const, message: "m" });

  it("says what really happened to the source check", async () => {
    expect(await run({ ...base, verdict: "LOW", findings: [] })).toEqual({ name: "source", status: "done", detail: "checked" });
    expect(await run({ ...base, verdict: "MEDIUM", findings: [f("unverified-source")] })).toEqual({ name: "source", status: "done", detail: "no verified source found" });
    expect(await run({ ...base, verdict: "MEDIUM", findings: [f("source-unavailable")] })).toEqual({ name: "source", status: "error", detail: "source lookup failed" });
    expect(await run({ ...base, verdict: "LOW", findings: [{ id: "no-code", severity: "low", message: "m" }] })).toEqual({ name: "source", status: "skipped", detail: "skipped (no contract code)" });
    expect(await run({ error: "rpc down" })).toEqual({ name: "source", status: "skipped", detail: "skipped (audit failed)" });
  });
});

describe("known limits of the source heuristics (documented, not hidden)", () => {
  // These tests pin down what the regex heuristics do NOT catch. If one starts failing because
  // the check got smarter, update the test and docs/ISSUES_FOR_AKUL.md. Bytecode checks are the
  // backbone; source findings are extra signal and say "Heuristic" in every message.
  it("catches a sweep whatever the function is called, because it reads the body", () => {
    expect(ids("contract A { function totallyInnocent() external onlyOwner { payable(msg.sender).transfer(address(this).balance); } }")).toEqual(["owner-sweep"]);
  });

  it("catches a sweep written in inline assembly (was a miss)", () => {
    const src = "contract A { function f() external onlyOwner { assembly { let ok := call(gas(), caller(), selfbalance(), 0, 0, 0, 0) } } }";
    expect(ids(src)).toEqual(["owner-sweep"]);
  });

  it("catches an owner check by a modifier that does not start with 'only' (was a miss)", () => {
    const src = "contract A { modifier auth() { require(msg.sender == owner); _; } function drain() external auth { payable(owner).transfer(address(this).balance); } }";
    expect(ids(src)).toEqual(["owner-sweep"]);
  });

  it("catches tx.origin copied into a variable first (was a miss)", () => {
    const src = "contract A { function f() external { address o = tx.origin; require(o == owner); } }";
    expect(ids(src)).toEqual(["tx-origin"]);
  });

  it("MISS: a sweep that reaches the balance through a helper in another function", () => {
    const src = "contract A { function _all() internal view returns (uint) { return address(this).balance; } function sweep() external onlyOwner { payable(owner).transfer(_all()); } }";
    expect(ids(src)).toEqual([]);
  });

  it("MISS: a fee setter with an unusual name", () => {
    expect(ids("contract A { function tune(uint a) external onlyOwner { buyFee = a; } }")).toEqual([]);
  });

  it("MISS: source that is not Solidity (for example Vyper) is not understood", () => {
    expect(ids("@external\ndef set_fee(x: uint256):\n    assert msg.sender == self.owner\n    self.fee = x")).toEqual([]);
  });
});
