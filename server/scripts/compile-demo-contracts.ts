// Compiles server/contracts/*.sol with solc (npm "solc", no system install) and writes
// src/demo/compiled.json: creation bytecode, runtime bytecode, and the standard-json input
// (so the source can be verified on Sourcify exactly as compiled).
// Run: npx tsx scripts/compile-demo-contracts.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const solc = createRequire(import.meta.url)("solc") as { compile(input: string): string; version(): string };
const dir = fileURLToPath(new URL("../contracts/", import.meta.url));
const out = fileURLToPath(new URL("../src/demo/compiled.json", import.meta.url));

const sources: Record<string, { content: string }> = {};
for (const f of readdirSync(dir).filter((n) => n.endsWith(".sol")).sort()) sources[f] = { content: readFileSync(dir + f, "utf8") };

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["evm.bytecode.object", "evm.deployedBytecode.object", "abi"] } },
  },
};
const res = JSON.parse(solc.compile(JSON.stringify(input))) as {
  errors?: Array<{ severity: string; formattedMessage: string }>;
  contracts: Record<string, Record<string, { abi: unknown; evm: { bytecode: { object: string }; deployedBytecode: { object: string } } }>>;
};
const errs = (res.errors ?? []).filter((e) => e.severity === "error");
if (errs.length) {
  console.error(errs.map((e) => e.formattedMessage).join("\n"));
  process.exit(1);
}
const contracts: Record<string, unknown> = {};
for (const [file, c] of Object.entries(res.contracts)) {
  for (const [name, art] of Object.entries(c)) {
    contracts[name] = {
      file,
      abi: art.abi,
      creation: "0x" + art.evm.bytecode.object,
      runtime: "0x" + art.evm.deployedBytecode.object,
    };
  }
}
writeFileSync(out, JSON.stringify({ solc: solc.version(), input, contracts }, null, 2) + "\n");
console.log("compiled", Object.keys(contracts).join(", "), "with solc", solc.version());
