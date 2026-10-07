import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import {
  type Item,
  PayloadKind,
  type ResumableWritable,
  type ResumeToken,
  type StreamHandle,
} from "@flowscripter/pluggable-io-framework-api";

async function committedSize(fullPath: string): Promise<number> {
  try {
    return (await stat(fullPath)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

/**
 * Opens a writable handle for a file. With `resume`, the file's current
 * size is the committed offset: writing continues by appending from there,
 * reported as `startOffset`. The resume token's offset is the number of
 * bytes the file system has acknowledged.
 */
export async function createWritableHandle(
  fullPath: string,
  resume?: ResumeToken,
): Promise<StreamHandle<PayloadKind.Js> & ResumableWritable & { readonly startOffset: number }> {
  await mkdir(dirname(fullPath), { recursive: true });
  const startOffset = resume ? await committedSize(fullPath) : 0;
  const nodeStream = createWriteStream(fullPath, { flags: resume ? "a" : "w" });
  // Failures are reported through the write and close callbacks.
  nodeStream.on("error", () => {});
  let committed = startOffset;
  const stream = new WritableStream<Item<PayloadKind.Js>>({
    write(item) {
      return new Promise<void>((res, rej) => {
        nodeStream.write(item.payload.data, (error) => {
          if (error) {
            rej(error);
            return;
          }
          committed += item.payload.data.byteLength;
          res();
        });
      });
    },
    close() {
      return new Promise<void>((res, rej) => {
        nodeStream.end((error?: Error | null) => (error ? rej(error) : res()));
      });
    },
    abort() {
      return new Promise<void>((res) => {
        nodeStream.once("close", () => res());
        nodeStream.destroy();
      });
    },
  });
  return {
    kind: PayloadKind.Js,
    stream,
    startOffset,
    resumeToken: () => ({ offset: committed }),
  };
}
