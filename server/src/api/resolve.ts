import { getAddress, isAddress } from "viem";
import { normalize } from "viem/ens";

// Minimal slice of a viem public client, so tests can pass a plain fake.
export type EnsClient = {
  getEnsAddress(args: { name: string }): Promise<string | null>;
};

export type ResolveResult = { address: `0x${string}` } | { error: string };

// Turns what the user typed into a real 0x address, or an error.
// An error is treated as a refusal by the gate, never as "let it through".
export async function resolveTarget(input: string, client: EnsClient): Promise<ResolveResult> {
  const text = input.trim();
  if (text === "") return { error: "No address or name was given." };

  if (/^0x/i.test(text)) {
    // strict: a mixed-case address must carry a valid EIP-55 checksum.
    if (!isAddress(text, { strict: true })) {
      return { error: "That is not a valid address (wrong length, characters or checksum)." };
    }
    return { address: getAddress(text) };
  }

  if (/\.eth$/i.test(text)) {
    let name: string;
    try {
      name = normalize(text);
    } catch {
      return { error: "That is not a valid .eth name." };
    }
    try {
      const resolved = await client.getEnsAddress({ name });
      if (!resolved || !isAddress(resolved)) {
        return { error: `No address is registered for ${text}.` };
      }
      return { address: getAddress(resolved) };
    } catch {
      return { error: `Could not look up ${text} right now.` };
    }
  }

  return { error: "Give a 0x address or a .eth name." };
}
