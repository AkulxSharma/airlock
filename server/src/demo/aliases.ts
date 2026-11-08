import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Aliases } from "../api/resolve.js";

const FILE = fileURLToPath(new URL("./demo-targets.json", import.meta.url));

export type DemoTarget = { address: string; expected: "LOW" | "MEDIUM" | "HIGH"; why: string; aliasOf?: string };

export function loadDemoTargets(file: string = FILE): Record<string, DemoTarget> {
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8")).targets ?? {};
}

// name -> address, lowercase names, for resolveTarget.
export function loadDemoAliases(file: string = FILE): Aliases {
  const out: Aliases = {};
  for (const [name, t] of Object.entries(loadDemoTargets(file))) out[name.toLowerCase()] = t.address;
  return out;
}
