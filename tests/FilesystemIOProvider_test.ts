import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsChunk } from "@flowscripter/pluggable-io-framework-api";
import { FilesystemIOProvider } from "../src/FilesystemIOProvider.ts";

let root: string;
let provider: FilesystemIOProvider;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pluggable-io-fs-test-"));
  provider = new FilesystemIOProvider(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("FilesystemIOProvider", () => {
  test("writes then reads back a file", async () => {
    const writable = await provider.getWritableStream("hello.txt");
    const writer = (writable.stream as WritableStream<JsChunk>).getWriter();
    await writer.write({ kind: provider.kind, data: new TextEncoder().encode("hello") });
    await writer.close();

    const readable = await provider.getReadableStream("hello.txt");
    const reader = (readable.stream as ReadableStream<JsChunk>).getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode((value as JsChunk).data)).toBe("hello");
  });

  test("getProperties reports size, lastModified and isFolder", async () => {
    await writeFile(join(root, "a.txt"), "abc");
    const properties = await provider.getProperties("a.txt");
    expect(properties.size).toBe(3);
    expect(properties.isFolder).toBe(false);
    expect(properties.lastModified).toBeInstanceOf(Date);

    const folderProperties = await provider.getProperties(".");
    expect(folderProperties.isFolder).toBe(true);
    expect(folderProperties.size).toBeUndefined();
  });

  test("list recursively and filters by regex", async () => {
    await writeFile(join(root, "a.txt"), "a");
    await writeFile(join(root, "b.md"), "b");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(root, "sub"));
    await writeFile(join(root, "sub", "c.txt"), "c");

    const paths: string[] = [];
    for await (const item of provider.list(".", { recursive: true, regex: /\.txt$/ })) {
      paths.push(item.path);
    }
    expect(paths.sort()).toEqual(["a.txt", "sub/c.txt"]);
  });

  test("setProperties applies mode", async () => {
    await writeFile(join(root, "a.txt"), "a");
    await provider.setProperties("a.txt", { mode: 0o600 });
    const properties = await provider.getProperties("a.txt");
    expect((properties.properties.mode as number) & 0o777).toBe(0o600);
  });

  test("delete removes a file", async () => {
    await writeFile(join(root, "a.txt"), "a");
    await provider.delete("a.txt");
    let threw = false;
    try {
      await provider.getProperties("a.txt");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("rejects paths that escape the root", async () => {
    let threw = false;
    try {
      await provider.getProperties("../../etc/passwd");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("multipart write then multipart read round-trips a large file", async () => {
    const original = new TextEncoder().encode("x".repeat(30));
    const writer = provider.getMultipartWriter("big.bin");
    async function* parts() {
      const half = 15;
      for (const [index, [start, end]] of [
        [0, half],
        [half, original.byteLength],
      ].entries()) {
        yield {
          index,
          offset: start,
          kind: provider.kind,
          stream: new ReadableStream<JsChunk>({
            start(controller) {
              controller.enqueue({ kind: provider.kind, data: original.subarray(start, end) });
              controller.close();
            },
          }),
          complete: async () => {},
        };
      }
    }
    await writer.write(parts());

    const collected: Uint8Array[] = [];
    for await (const part of provider.getMultipartReader("big.bin")) {
      const reader = (part.stream as ReadableStream<JsChunk>).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        collected.push(value.data);
      }
    }
    expect(Buffer.concat(collected).toString()).toBe("x".repeat(30));
  });

  test("canDirectTransfer is true for same root, directCopy copies within it", async () => {
    await writeFile(join(root, "a.txt"), "hello");
    const other = new FilesystemIOProvider(root);
    expect(provider.canDirectTransfer(other)).toBe(true);

    await provider.directCopy("a.txt", "b.txt");
    const properties = await provider.getProperties("b.txt");
    expect(properties.size).toBe(5);
  });

  test("canDirectTransfer is false for a different root", async () => {
    const otherRoot = await mkdtemp(join(tmpdir(), "pluggable-io-fs-test-other-"));
    try {
      const other = new FilesystemIOProvider(otherRoot);
      expect(provider.canDirectTransfer(other)).toBe(false);
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  test("directMove relocates a file within the root", async () => {
    await writeFile(join(root, "a.txt"), "hello");
    await provider.directMove("a.txt", "moved/b.txt");
    const properties = await provider.getProperties("moved/b.txt");
    expect(properties.size).toBe(5);
    let threw = false;
    try {
      await provider.getProperties("a.txt");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
