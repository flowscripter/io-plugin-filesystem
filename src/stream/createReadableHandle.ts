import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import {
  fromWebReadableStream,
  type Item,
  PayloadKind,
  type RangeReadable,
  type StreamHandle,
} from "@flowscripter/pluggable-io-framework-api";

function openRange(
  fullPath: string,
  start: number,
  end?: number,
): ReadableStream<Item<PayloadKind.Js>> {
  if (end !== undefined && end <= start) {
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  }
  const nodeStream = createReadStream(fullPath, {
    start,
    end: end === undefined ? undefined : end - 1,
  });
  return fromWebReadableStream(Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>);
}

/**
 * Opens a readable handle for a file. `readRange(start, end)` reads bytes
 * `start` (inclusive) to `end` (exclusive) through a fresh file stream.
 */
export function createReadableHandle(
  fullPath: string,
): StreamHandle<PayloadKind.Js> & RangeReadable<PayloadKind.Js> {
  return {
    kind: PayloadKind.Js,
    stream: openRange(fullPath, 0),
    async readRange(start: number, end: number) {
      return openRange(fullPath, start, end);
    },
  };
}
