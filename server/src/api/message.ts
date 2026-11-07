import { randomUUID } from "node:crypto";
import { guardVoiceInput } from "../../../voice/guard.js";
import { normalizeTranscript } from "../../../voice/normalize.js";
import { ruleBasedAgent, type Agent } from "../agent/parse.js";
import type { LiveAuditOutcome } from "../auditor/chain.js";
import { DEFAULT_TTL_MS, type ConfirmStore } from "../gate/confirm.js";
import { decide } from "../gate/decide.js";
import type { Finding, MessageRequest, MessageResponse, Stage } from "../types.js";
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
};

const HELP =
  "I check a crypto address before any funds move. Try: send 0.01 to vitalik.eth (testnet only). I will audit it, then ask you to confirm with YES or NO.";

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

export function createMessageHandler(deps: MessageDeps) {
  const agent = deps.agent ?? ruleBasedAgent;
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const newId = deps.newId ?? randomUUID;

  return async function handle(req: MessageRequest): Promise<MessageResponse> {
    const final = new Map<Stage["name"], Stage>();
    const emit = (stage: Stage) => {
      final.set(stage.name, stage);
      deps.publish(req.sessionId, stage);
    };
    const done = (reply: string, needsConfirm = false): MessageResponse => ({
      reply,
      stages: [...final.values()],
      needsConfirm,
    });

    let text = req.text;
    if (req.channel === "voice") {
      // A heard address can be a different, valid-looking address. Never use one by voice.
      const guard = guardVoiceInput(text);
      if (!guard.ok) return done(guard.reason);
      text = normalizeTranscript(text);
    }

    const intent = await agent.handle(text);

    if (intent.kind === "help") return done(HELP);

    if (intent.kind === "no") {
      deps.store.cancel(req.sessionId);
      return done("Cancelled. Nothing was sent.");
    }

    if (intent.kind === "yes") {
      const pending = deps.store.peek(req.sessionId);
      if (!pending) return done("Nothing is waiting for confirmation.");
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

    emit({ name: "bytecode", status: "pending" });
    const outcome = await deps.audit(resolved.address);
    const failed = "error" in outcome || "timeout" in outcome;
    emit({
      name: "bytecode",
      status: failed ? "error" : "done",
      detail: "error" in outcome ? outcome.error : "timeout" in outcome ? "timeout" : undefined,
    });
    emit({ name: "source", status: "done", detail: "not checked yet" });

    const decision = decide(outcome);
    emit({ name: "gate", status: decision.action === "refuse" ? "error" : "done", detail: decision.action });

    if (decision.action === "refuse") {
      const findings = "findings" in outcome ? `\n${findingLines(outcome.findings)}` : "";
      return done(`Refused. ${decision.reason}${findings}`);
    }

    // decide() only confirms a well-formed result, so the findings are present here.
    const audit = outcome as Extract<LiveAuditOutcome, { verdict: string }>;
    deps.store.create(
      req.sessionId,
      { id: newId(), to: resolved.address, amountEth: intent.amountEth },
      deps.now(),
      ttlMs,
    );
    return done(
      [
        `Risk signal: ${audit.verdict} (score ${audit.riskScore}).`,
        findingLines(audit.findings),
        `To send: ${intent.amountEth} test ETH to ${resolved.address}.`,
        `This is a risk signal, not a guarantee. Reply YES to send or NO to cancel. It expires in ${Math.round(ttlMs / 1000)} seconds.`,
      ].join("\n"),
      true,
    );
  };
}
