import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Item,
  type PayloadKind,
  isRangeReadable,
} from "@flowscripter/pluggable-io-framework-api";
import { createReadableHandle } from "../../src/stream/createReadableHandle.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "io-fs-read-test-"));
  await writeFile(join(root, "a.txt"), "0123456789");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function text(stream: ReadableStream<Item<PayloadKind.Js>>): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value.payload.data);
  }
  return Buffer.concat(chunks).toString();
}

describe("createReadableHandle", () => {
  test("streams the whole file", async () => {
    const handle = createReadableHandle(join(root, "a.txt"));
    expect(await text(handle.stream as ReadableStream<Item<PayloadKind.Js>>)).toBe("0123456789");
    await handle.readRange(0, 0);
  });

  test("is RangeReadable with an exclusive end", async () => {
    const handle = createReadableHandle(join(root, "a.txt"));
    expect(isRangeReadable(handle)).toBe(true);
    expect(await text(await handle.readRange(2, 5))).toBe("234");
    expect(await text(await handle.readRange(8, Number.MAX_SAFE_INTEGER))).toBe("89");
    expect(await text(await handle.readRange(5, 5))).toBe("");
  });
});
