import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Item,
  PayloadKind,
  isResumableWritable,
} from "@flowscripter/pluggable-io-framework-api";
import { createWritableHandle } from "../../src/stream/createWritableHandle.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "io-fs-write-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function item(text: string): Item<PayloadKind.Js> {
  return { payload: { kind: PayloadKind.Js, data: new TextEncoder().encode(text) } };
}

describe("createWritableHandle", () => {
  test("creates parent directories and tracks the committed offset", async () => {
    const path = join(root, "nested", "a.txt");
    const handle = await createWritableHandle(path);
    expect(isResumableWritable(handle)).toBe(true);
    expect(handle.startOffset).toBe(0);
    const writer = (handle.stream as WritableStream<Item<PayloadKind.Js>>).getWriter();
    await writer.write(item("abc"));
    expect(handle.resumeToken()).toEqual({ offset: 3 });
    await writer.close();
    expect(await Bun.file(path).text()).toBe("abc");
  });

  test("resuming a missing file starts at offset 0", async () => {
    const handle = await createWritableHandle(join(root, "missing.txt"), { offset: 10 });
    expect(handle.startOffset).toBe(0);
    await (handle.stream as WritableStream<Item<PayloadKind.Js>>).getWriter().close();
  });

  test("resume appends from the file's actual size, not the token offset", async () => {
    const path = join(root, "a.txt");
    await Bun.write(path, "hello ");
    const handle = await createWritableHandle(path, { offset: 2 });
    expect(handle.startOffset).toBe(6);
    const writer = (handle.stream as WritableStream<Item<PayloadKind.Js>>).getWriter();
    await writer.write(item("world"));
    await writer.close();
    expect(await Bun.file(path).text()).toBe("hello world");
    expect(handle.resumeToken()).toEqual({ offset: 11 });
  });

  test("a failing stat other than a missing file is reported", async () => {
    await expect(createWritableHandle(join(root, "a\0b"), { offset: 0 })).rejects.toThrow();
  });
  test("a write failure rejects the write", async () => {
    const handle = await createWritableHandle(root);
    const writer = (handle.stream as WritableStream<Item<PayloadKind.Js>>).getWriter();
    await expect(writer.write(item("abc"))).rejects.toThrow();
  });
});
