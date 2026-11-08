import { describe, expect, it } from "vitest";
import { parseSse } from "./sse";

describe("parseSse", () => {
  it("reads events with names, data and ids, and keeps an unfinished event for later", () => {
    const { messages, rest } = parseSse('event: ready\ndata: ok\n\nid: 7\nevent: stage\ndata: {"a":1}\n\nevent: sta');
    expect(messages).toEqual([
      { event: "ready", data: "ok", id: undefined },
      { event: "stage", data: '{"a":1}', id: "7" },
    ]);
    expect(rest).toBe("event: sta");
  });
  it("handles CRLF, comments, multi-line data and a missing space after the colon", () => {
    const { messages } = parseSse(": keepalive\r\n\r\nevent:x\r\ndata:a\r\ndata: b\r\n\r\n");
    expect(messages).toEqual([{ event: "x", data: "a\nb", id: undefined }]);
  });
  it("joins chunks split anywhere", () => {
    const whole = "event: activity\nid: 3\ndata: {\"k\":\"v\"}\n\n";
    let buf = "";
    const got: string[] = [];
    for (const ch of whole) {
      buf += ch;
      const r = parseSse(buf);
      buf = r.rest;
      got.push(...r.messages.map((m) => m.data));
    }
    expect(got).toEqual(['{"k":"v"}']);
  });
});
