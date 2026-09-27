import type { SearchEvent } from "@/lib/schemas/search-api";

const encoder = new TextEncoder();

export function encodeSseEvent(event: SearchEvent): Uint8Array {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

/**
 * POST fetch の ReadableStream から SSE を読み取る。
 * 不正な行は無視し、data のJSONだけを返す。
 */
export async function* readSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SearchEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = parseSseChunk(chunk);
        if (event) yield event;
      }
    }
    const tail = parseSseChunk(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

export function parseSseChunk(chunk: string): SearchEvent | null {
  const data = chunk
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as SearchEvent;
    return parsed && typeof parsed.type === "string" && typeof parsed.requestId === "string" ? parsed : null;
  } catch {
    return null;
  }
}
