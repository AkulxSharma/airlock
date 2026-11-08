// A small server-sent-events reader built on fetch instead of EventSource.
// EventSource cannot send request headers, and ngrok's free plan shows a warning page to any browser
// request that lacks the "ngrok-skip-browser-warning" header, which breaks the live streams. fetch can send it.

export type SseMessage = { event: string; data: string; id?: string };

/** Splits an SSE text buffer into complete messages and returns the unfinished rest. */
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const messages: SseMessage[] = [];
  for (const block of blocks) {
    let event = "message";
    let id: string | undefined;
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line === "" || line.startsWith(":")) continue;
      const i = line.indexOf(":");
      const field = i === -1 ? line : line.slice(0, i);
      const value = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
      else if (field === "id") id = value;
    }
    if (data.length > 0 || event !== "message") messages.push({ event, data: data.join("\n"), id });
  }
  return { messages, rest };
}

/**
 * Opens a stream and calls onMessage for every event. Reconnects by itself (after 2 seconds) when the
 * connection drops. onStatus(true) fires when connected, onStatus(false) when it drops. Returns a close function.
 */
export function openEventStream(
  url: string,
  onMessage: (m: SseMessage) => void,
  onStatus?: (up: boolean) => void,
): () => void {
  let closed = false;
  let controller: AbortController | null = null;

  const run = async () => {
    while (!closed) {
      controller = new AbortController();
      try {
        const res = await fetch(url, {
          headers: { accept: "text/event-stream", "ngrok-skip-browser-warning": "1" },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").includes("text/event-stream")) throw new Error("not a stream");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        onStatus?.(true);
        while (!closed) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { messages, rest } = parseSse(buffer);
          buffer = rest;
          for (const m of messages) onMessage(m);
        }
      } catch {
        /* dropped or aborted: fall through to reconnect */
      }
      onStatus?.(false);
      if (!closed) await new Promise((r) => setTimeout(r, 2000));
    }
  };
  void run();

  return () => {
    closed = true;
    controller?.abort();
  };
}
