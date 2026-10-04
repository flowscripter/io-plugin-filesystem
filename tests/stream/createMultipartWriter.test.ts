import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Item, PayloadKind } from "@flowscripter/pluggable-io-framework-api";
import { createMultipartWriter } from "../../src/stream/createMultipartWriter.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "io-fs-multipart-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createMultipartWriter", () => {
  test("writes parts at their offsets regardless of arrival order", async () => {
    const path = join(root, "nested", "big.bin");
    const completed: number[] = [];
    async function* parts() {
      for (const [index, offset, text] of [
        [1, 3, "def"],
        [0, 0, "abc"],
      ] as const) {
        yield {
          index,
          offset,
          kind: PayloadKind.Js as const,
          stream: new ReadableStream<Item<PayloadKind.Js>>({
            start(controller) {
              controller.enqueue({
                payload: { kind: PayloadKind.Js, data: new TextEncoder().encode(text) },
              });
              controller.close();
            },
          }),
          complete: async () => {
            completed.push(index);
          },
        };
      }
    }
    await createMultipartWriter(path).write(parts());
    expect(await Bun.file(path).text()).toBe("abcdef");
    expect(completed.sort()).toEqual([0, 1]);
  });
});
