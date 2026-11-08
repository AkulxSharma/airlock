import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/auditor/source.js";

// A labelled corpus: contracts that carry a rug-pull / drainer / honeypot signal, and ordinary
// contracts that must stay quiet. Each vulnerable file lists the finding it must produce.
// Source checks are heuristics: a miss here is written down on purpose, not hidden.
const read = (dir: string, file: string) => readFileSync(new URL(`./corpus/${dir}/${file}`, import.meta.url), "utf8");
const ids = (dir: string, file: string) => analyzeSource({ [file]: read(dir, file) }).map((f) => f.id);

const VULNERABLE: Record<string, string> = {
  "rug-sweep-eth.sol": "owner-sweep",
  "rug-sweep-token.sol": "owner-sweep",
  "rug-sweep-call.sol": "owner-sweep",
  "rug-sweep-assembly.sol": "owner-sweep",
  "rug-sweep-modifier-name.sol": "owner-sweep",
  "tx-origin-wallet.sol": "tx-origin",
  "tx-origin-variable.sol": "tx-origin",
  "honeypot-blacklist.sol": "blacklist-switch",
  "hidden-owner-transfer-block.sol": "blacklist-switch",
  "honeypot-sell-fee.sol": "adjustable-fee",
  "honeypot-trading-gate.sol": "trading-switch",
  "mint-owner.sol": "owner-mint",
  "reentrancy-vault.sol": "reentrancy-risk",
};

// Not a source-level signal: selfdestruct and delegatecall are caught from the bytecode.
const NOT_IN_SOURCE_SCOPE = ["selfdestruct-kill.sol", "delegatecall-arbitrary.sol"];

const GOOD = [
  "erc20-plain.sol",
  "weth9.sol",
  "vault-user-withdraw.sol",
  "ownable-no-powers.sol",
  "oz-style-ownable-erc20.sol",
  "user-mint-payable.sol",
  "escrow-pull-payment.sol",
  "uses-msg-sender-only.sol",
  "comment-mentions-risks.sol",
];

describe("corpus: vulnerable contracts", () => {
  for (const [file, id] of Object.entries(VULNERABLE)) {
    it(`${file} raises ${id}`, () => expect(ids("vulnerable", file)).toContain(id));
  }
  it("out-of-scope files stay quiet at source level (bytecode or nothing covers them)", () => {
    for (const f of NOT_IN_SOURCE_SCOPE) expect(ids("vulnerable", f)).toEqual([]);
  });
});

describe("corpus: ordinary contracts", () => {
  for (const file of GOOD) {
    it(`${file} raises nothing`, () => expect(ids("good", file)).toEqual([]));
  }
});
