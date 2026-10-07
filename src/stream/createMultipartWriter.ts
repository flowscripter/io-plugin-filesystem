import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import type { Item, Part, PayloadKind } from "@flowscripter/pluggable-io-framework-api";

/**
 * Writes concurrently arriving parts directly to their file offsets via a
 * single shared file handle.
 */
export function createMultipartWriter(fullPath: string): {
  write(parts: AsyncIterable<Part<PayloadKind.Js>>): Promise<void>;
} {
  return {
    async write(parts: AsyncIterable<Part<PayloadKind.Js>>): Promise<void> {
      await mkdir(dirname(fullPath), { recursive: true });
      const handle = await open(fullPath, "w");
      try {
        const writes: Promise<void>[] = [];
        for await (const part of parts) {
          writes.push(
            (async () => {
              const reader = (part.stream as ReadableStream<Item<PayloadKind.Js>>).getReader();
              let position = part.offset;
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                const data = value.payload.data;
                await handle.write(data, 0, data.byteLength, position);
                position += data.byteLength;
              }
              await part.complete();
            })(),
          );
        }
        await Promise.all(writes);
      } finally {
        await handle.close();
      }
    },
  };
}
