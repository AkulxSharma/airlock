import { randomUUID } from "node:crypto";
import { guardVoiceInput } from "../../../voice/guard.js";
import { canonicalizeCommand, normalizeTranscript } from "../../../voice/normalize.js";
import type { ExplainContext } from "../agent/gemini.js";
import { ruleBasedAgent, type Agent } from "../agent/parse.js";
import { HELP_REPLY, smallTalkReply, type SmallTalk } from "../agent/smalltalk.js";
import type { LiveAuditOutcome } from "../auditor/chain.js";
import { DEFAULT_TTL_MS, type ConfirmStore } from "../gate/confirm.js";
import { decide } from "../gate/decide.js";
import type { AuditResult, Finding, MessageRequest, MessageResponse, Stage } from "../types.js";
import { checkAmount, sendTestnet, type WalletLike } from "../wallet/send.js";
import type { ResolveResult } from "./resolve.js";

export type MessageDeps = {
  resolve(input: string): Promise<ResolveResult>;
  audit(address: string): Promise<LiveAuditOutcome>;
  store: ConfirmStore;
  wallet: WalletLike | null;
  now(): number;
  maxTransferEth: string;
  ttlMs?: number;
  publish(sessionId: string, stage: Stage): void;
  newId?(): string;
  agent?: Agent;
  // Optional plain-language note about the findings (Gemini). It is added after the
  // fixed, code-written lines and never replaces them. Null means "show the template only".
  explain?(ctx: ExplainContext): Promise<string | null>;
  // Canned replies for greetings, "how are you", "what does it do", thanks and goodbye. They run before the
  // model is asked anything, so they cost no tokens. Defaults to the replies in agent/smalltalk.json.
  smallTalk?: SmallTalk;
};

const HELP =
  "I check a crypto address before any funds move. Try: send 0.01 to vitalik.eth (testnet only). I will audit it, then ask you to confirm with YES or NO.";

// For texting and voice, people also need to know to say the name, or the line stays silent.
const HELP_TEXTING =
  "I'm Airlock. I check a crypto address before any funds move (testnet only). Text me: Airlock send 0.001 to weth.demo. I'll audit it, then ask you to confirm with YES or NO.";

// The example a small-talk reply invites people to try, by channel.
const TRY_GUI = "send 0.01 to vitalik.eth";
const TRY_TEXTING = "Airlock send 0.01 to vitalik.eth";

const SEND_FAILURE: Record<string, string> = {
  "invalid-address": "The send was stopped: the address is not valid.",
  "invalid-amount": "The send was stopped: the amount is not valid.",
  "over-cap": "The send was stopped: the amount is above the per-transfer cap.",
  "wrong-chain": "The send was stopped: the network is not Sepolia.",
  "send-failed": "The send failed on the network. Nothing was confirmed. Try again.",
};

function findingLines(findings: Finding[]): string {
  if (findings.length === 0) return "No findings.";
  return findings.map((f) => `- [${f.severity}] ${f.message}`).join("\n");
}

/**
 * Typed (gui) and texted (imessage) messages get the same synonym mapping as voice ("pay 0.01 ETH
 * over to Vitalik.eth" -> send, "go ahead" -> yes), but without the full voice normalizer: that
 * lowercases everything and would lose the checksum casing of a pasted address. Matching runs on
 * a lowercase copy; a rewritten send takes its destination back from the original text.
 */
export function canonicalizeTyped(text: string): string {
  const lower = text.trim().toLowerCase().replace(/[.,;:!?]+(?=\s|$)/g, "").replace(/\s+/g, " ");
  const canon = canonicalizeCommand(lower);
  if (canon === lower) return text; // nothing to map: leave the user's text untouched
  if (canon === "yes" || canon === "no") return canon;
  const m = /^send (\S+) eth to (\S+)$/.exec(canon);
  if (!m) return text;
  const orig = text.split(/\s+/).map((w) => w.replace(/[.,;:!?]+$/, "")).find((w) => w.toLowerCase() === m[2]);
  return `send ${m[1]} eth to ${orig ?? m[2]}`;
}

export function createMessageHandler(deps: MessageDeps) {
  const agent = deps.agent ?? ruleBasedAgent;
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const newId = deps.newId ?? randomUUID;

  const explainNote = async (a: AuditResult, decision: "refuse" | "confirm"): Promise<string> => {
    if (!deps.explain) return "";
    try {
      const n = await deps.explain({
        verdict: a.verdict,
        riskScore: a.riskScore,
        decision,
        findings: a.findings,
      });
      return n ? `\nIn plain words: ${n}` : "";
    } catch {
      return "";
    }
  };

  return async function handle(req: MessageRequest): Promise<MessageResponse> {
    const final = new Map<Stage["name"], Stage>();
    const emit = (stage: Stage) => {
      final.set(stage.name, stage);
      deps.publish(req.sessionId, stage);
    };
    const done = (
      reply: string,
      needsConfirm = false,
      extra: Pick<MessageResponse, "audit" | "pending"> = {},
    ): MessageResponse => ({
      reply,
      stages: [...final.values()],
      needsConfirm,
      ...extra,
    });

    let text = req.text;
    if (req.channel === "voice") {
      // A heard address can be a different, valid-looking address. Never use one by voice.
      const guard = guardVoiceInput(text);
      if (!guard.ok) return done(guard.reason);
      // The shared normalizer knows "dot eth"; demo names (.demo) are handled here.
      text = normalizeTranscript(text).replace(/\s+dot\s+demo\b/gi, ".demo");
    } else {
      text = canonicalizeTyped(text);
    }

    // Greetings and simple questions get a polite canned reply with no model call (see agent/smalltalk.ts).
    const waiting = deps.store.peek(req.sessionId);
    const talk = (deps.smallTalk ?? smallTalkReply)(
      text,
      req.channel === "gui" ? TRY_GUI : TRY_TEXTING,
      waiting !== undefined && waiting.expiresAt > deps.now(),
    );
    if (talk) return done(talk === HELP_REPLY ? (req.channel === "gui" ? HELP : HELP_TEXTING) : talk);

    const intent = await agent.handle(text);

    if (intent.kind === "help") return done(req.channel === "gui" ? HELP : HELP_TEXTING);

    if (intent.kind === "no") {
      deps.store.cancel(req.sessionId);
      return done("Cancelled. Nothing was sent.");
    }

    if (intent.kind === "yes") {
      const pending = deps.store.peek(req.sessionId);
      if (!pending) return done("Nothing is waiting for confirmation.");
      // Expiry is reported first, whatever else is wrong, so the reason given is the real one.
      if (deps.now() >= pending.expiresAt) {
        deps.store.consume(req.sessionId, pending.id, deps.now()); // clears the expired request
        return done("That request expired, so nothing was sent. Ask again to start over.");
      }
      // With no wallet the request is kept, so it is not lost if a wallet is configured in time.
      if (!deps.wallet) return done("Sending is not set up on this server, so nothing was sent.");
      const consumed = deps.store.consume(req.sessionId, pending.id, deps.now());
      if (!consumed.ok) {
        return done(
          consumed.reason === "expired"
            ? "That request expired, so nothing was sent. Ask again to start over."
            : "Nothing is waiting for confirmation.",
        );
      }
      const sent = await sendTestnet(consumed.transfer, deps.wallet, deps.maxTransferEth);
      if (!sent.ok) return done(SEND_FAILURE[sent.reason] ?? SEND_FAILURE["send-failed"]);
      return done(
        `Sent ${consumed.transfer.amountEth} test ETH to ${consumed.transfer.to}.\nhttps://sepolia.etherscan.io/tx/${sent.hash}`,
      );
    }

    // intent.kind === "send"
    const amountCheck = checkAmount(intent.amountEth, deps.maxTransferEth);
    if (amountCheck !== "ok") {
      emit({ name: "gate", status: "error", detail: amountCheck });
      return done(
        amountCheck === "over-cap"
          ? `Refused. The cap is ${deps.maxTransferEth} test ETH per transfer.`
          : "Refused. That amount is not valid.",
      );
    }

    emit({ name: "address", status: "pending" });
    const resolved = await deps.resolve(intent.target);
    if ("error" in resolved) {
      emit({ name: "address", status: "error", detail: resolved.error });
      return done(`Refused. ${resolved.error}`);
    }
    emit({ name: "address", status: "done", detail: resolved.address });
    // A .eth name is looked up on Ethereum mainnet, but the audit and the send are on Sepolia.
    const ensNote = /\.eth$/i.test(intent.target)
      ? "\nNote: this name was looked up on Ethereum mainnet, but Airlock audits and sends on the Sepolia test network, where the code at this address can be different."
      : "";

    emit({ name: "bytecode", status: "pending" });
    const outcome = await deps.audit(resolved.address);
    const failed = "error" in outcome || "timeout" in outcome;
    emit({
      name: "bytecode",
      status: failed ? "error" : "done",
      detail: "error" in outcome ? outcome.error : "timeout" in outcome ? "timeout" : undefined,
    });
    const ids = new Set("findings" in outcome ? outcome.findings.map((f) => f.id) : []);
    emit(
      failed
        ? { name: "source", status: "skipped", detail: "skipped (audit failed)" }
        : ids.has("source-unavailable")
          ? { name: "source", status: "error", detail: "source lookup failed" }
          : {
              name: "source",
              status: ids.has("no-code") ? "skipped" : "done",
              detail: ids.has("unverified-source")
                ? "no verified source found"
                : ids.has("no-code")
                  ? "skipped (no contract code)"
                  : "checked",
            },
    );

    const decision = decide(outcome, { target: resolved.address });
    emit({ name: "gate", status: decision.action === "refuse" ? "error" : "done", detail: decision.action });

    if (decision.action === "refuse") {
      const findings = "findings" in outcome ? `\n${findingLines(outcome.findings)}` : "";
      const note = "verdict" in outcome ? await explainNote(outcome, "refuse") : "";
      return done(
        `Refused. ${decision.reason}${findings}${note}${ensNote}`,
        false,
        "verdict" in outcome ? { audit: outcome } : {},
      );
    }

    // decide() only confirms a well-formed result, so the findings are present here.
    const audit = outcome as Extract<LiveAuditOutcome, { verdict: string }>;
    const pending = deps.store.create(
      req.sessionId,
      { id: newId(), to: resolved.address, amountEth: intent.amountEth },
      deps.now(),
      ttlMs,
    );
    const note = await explainNote(audit, "confirm");
    return done(
      [
        `Risk signal: ${audit.verdict} (score ${audit.riskScore}).`,
        findingLines(audit.findings) + note + ensNote,
        `To send: ${intent.amountEth} test ETH to ${resolved.address}.`,
        `This is a risk signal, not a guarantee. Reply YES to send or NO to cancel. It expires in ${Math.round(ttlMs / 1000)} seconds.`,
      ].join("\n"),
      true,
      {
        audit,
        pending: { to: pending.to, amountEth: pending.amountEth, expiresAt: pending.expiresAt },
      },
    );
  };
}
