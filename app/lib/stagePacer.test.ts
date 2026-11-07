import { describe, expect, it } from "vitest";
import type { Stage } from "./api";
import { createStagePacer } from "./stagePacer";

const st = (name: Stage["name"], status: Stage["status"], detail?: string): Stage => ({ name, status, detail });
const show = (s: Stage) => `${s.name}:${s.status}`;

/** A fake clock: wait() records the pauses and resolves right away. */
function setup() {
  const shown: string[] = [];
  const pauses: number[] = [];
  const pacer = createStagePacer((s) => shown.push(show(s)), 500, async (ms) => { pauses.push(ms); });
  return { shown, pauses, pacer };
}

describe("createStagePacer", () => {
  it("shows updates in order, one at a time, with a pause after each", async () => {
    const { shown, pauses, pacer } = setup();
    for (const s of [st("address", "pending"), st("address", "done", "0xabc"), st("bytecode", "pending"), st("bytecode", "done"), st("source", "done"), st("gate", "done", "confirm")]) pacer.push(s);
    await pacer.drain();
    expect(shown).toEqual(["address:pending", "address:done", "bytecode:pending", "bytecode:done", "source:done", "gate:done"]);
    expect(pauses).toEqual([500, 500, 500, 500, 500, 500]);
  });

  it("drain resolves immediately when nothing is queued", async () => {
    const { shown, pacer } = setup();
    await pacer.drain();
    expect(shown).toEqual([]);
  });

  it("drops a late 'pending' for a stage that already finished", async () => {
    const { shown, pacer } = setup();
    pacer.push(st("bytecode", "done"));
    pacer.push(st("bytecode", "pending")); // late stream event after the final state
    await pacer.drain();
    expect(shown).toEqual(["bytecode:done"]);
  });

  it("drops an exact repeat, but keeps a real change of detail", async () => {
    const { shown, pacer } = setup();
    pacer.push(st("gate", "error", "over-cap"));
    pacer.push(st("gate", "error", "over-cap"));
    pacer.push(st("gate", "error", "refuse"));
    await pacer.drain();
    expect(shown).toEqual(["gate:error", "gate:error"]);
  });

  it("keeps order when an update arrives while earlier ones are still playing", async () => {
    const { shown, pacer } = setup();
    pacer.push(st("address", "done"));
    pacer.push(st("bytecode", "done"));
    const first = pacer.drain();
    pacer.push(st("gate", "done")); // pushed mid-run
    await first;
    await pacer.drain();
    expect(shown).toEqual(["address:done", "bytecode:done", "gate:done"]);
  });

  it("reset forgets the queue and the memory of finished stages", async () => {
    const { shown, pacer } = setup();
    pacer.push(st("address", "done"));
    pacer.push(st("bytecode", "done"));
    pacer.reset();
    pacer.push(st("address", "pending")); // allowed again after a reset
    await pacer.drain();
    expect(shown[shown.length - 1]).toBe("address:pending");
    expect(shown).not.toContain("bytecode:done");
  });
});
