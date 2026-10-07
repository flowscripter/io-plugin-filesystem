import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Item, PayloadKind } from "@flowscripter/pluggable-io-framework-api";
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
    const writer = (writable.stream as WritableStream<Item<PayloadKind.Js>>).getWriter();
    await writer.write({
      payload: { kind: provider.kind, data: new TextEncoder().encode("hello") },
    });
    await writer.close();

    const readable = await provider.getReadableStream("hello.txt");
    const reader = (readable.stream as ReadableStream<Item<PayloadKind.Js>>).getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value?.payload.data)).toBe("hello");
  });

  test("getProperties reports size, lastModified and isContainer", async () => {
    await writeFile(join(root, "a.txt"), "abc");
    const properties = await provider.getProperties("a.txt");
    expect(properties.size).toBe(3);
    expect(properties.isContainer).toBe(false);
    expect(properties.lastModified).toBeInstanceOf(Date);

    const folderProperties = await provider.getProperties(".");
    expect(folderProperties.isContainer).toBe(true);
    expect(folderProperties.size).toBeUndefined();
  });

  test("list recursively and filters by regex", async () => {
    await writeFile(join(root, "a.txt"), "a");
    await writeFile(join(root, "b.md"), "b");
    await mkdir(join(root, "sub"));
    await writeFile(join(root, "sub", "c.txt"), "c");

    const paths: string[] = [];
    for await (const item of provider.list(".", { recursive: true, regex: /\.txt$/ })) {
      paths.push(item.path);
    }
    expect(paths.sort()).toEqual(["a.txt", "sub/c.txt"]);
  });

  test("setProperties applies mode", async () => {
    // NTFS has no POSIX permission bits - chmod on Windows only toggles a
    // read-only flag, so exact bit equality is only meaningful elsewhere.
    if (process.platform === "win32") {
      return;
    }
    await writeFile(join(root, "a.txt"), "a");
    await provider.setProperties("a.txt", { properties: { mode: 0o600 } });
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

  test('rootPath="" gives unrestricted access, even to paths outside the constructed root', async () => {
    // Exercises the constructor, not just resolvePath: calling resolve(rootPath)
    // unconditionally would collapse "" to cwd before resolvePath ever saw the
    // "unrestricted" sentinel, which resolvePath's own unit tests can't detect
    // since they call resolvePath directly.
    const unrestricted = new FilesystemIOProvider("");
    await writeFile(join(root, "outside.txt"), "hello");

    const properties = await unrestricted.getProperties(join(root, "outside.txt"));
    expect(properties.size).toBe(5);
  });

  test("multipart write then ranged reads round-trip a large file", async () => {
    const original = new TextEncoder().encode("x".repeat(30));
    const writer = provider.getMultipartWriter("big.bin", 15);
    async function* parts() {
      const half = 15;
      for (const [index, [start, end]] of [
        [0, half],
        [half, original.byteLength],
      ].entries()) {
        yield {
          index,
          offset: start,
          kind: PayloadKind.Js as const,
          stream: new ReadableStream<Item<PayloadKind.Js>>({
            start(controller) {
              controller.enqueue({
                payload: { kind: provider.kind, data: original.subarray(start, end) },
              });
              controller.close();
            },
          }),
          complete: async () => {},
        };
      }
    }
    await writer.write(parts());

    const readable = await provider.getReadableStream("big.bin");
    const collected: Uint8Array[] = [];
    for (const [start, end] of [
      [0, 15],
      [15, 30],
    ] as const) {
      const reader = (await readable.readRange(start, end)).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        collected.push(value.payload.data);
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

  test("createContainer creates an empty directory, idempotently", async () => {
    await provider.createContainer("empty/nested");
    const properties = await provider.getProperties("empty/nested");
    expect(properties.isContainer).toBe(true);
    // mkdir -p style - calling again on an existing directory must not throw.
    await provider.createContainer("empty/nested");
  });

  test("getPartSizeConstraints reports unconstrained bounds with an 8MB default", () => {
    const constraints = provider.getPartSizeConstraints(1024 * 1024 * 1024);
    expect(constraints.minPartSize).toBe(0);
    expect(constraints.maxPartSize).toBe(Infinity);
    expect(constraints.maxParts).toBe(Infinity);
    expect(constraints.defaultPartSize).toBe(8 * 1024 * 1024);
  });

  test("supportsRecursiveDirectTransfer is true", () => {
    expect(provider.supportsRecursiveDirectTransfer).toBe(true);
  });

  test("directCopy recursively copies a directory, including an empty subdirectory", async () => {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.txt"), "A");
    await mkdir(join(root, "src", "nested"), { recursive: true });
    await writeFile(join(root, "src", "nested", "b.txt"), "B");
    await mkdir(join(root, "src", "emptyDir"), { recursive: true });

    await provider.directCopy("src", "dest");

    expect((await provider.getProperties("dest/a.txt")).size).toBe(1);
    expect((await provider.getProperties("dest/nested/b.txt")).size).toBe(1);
    expect((await provider.getProperties("dest/emptyDir")).isContainer).toBe(true);
  });

  test("directMove recursively relocates a directory", async () => {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.txt"), "A");
    await mkdir(join(root, "src", "nested"), { recursive: true });
    await writeFile(join(root, "src", "nested", "b.txt"), "B");

    await provider.directMove("src", "dest");

    expect((await provider.getProperties("dest/a.txt")).size).toBe(1);
    expect((await provider.getProperties("dest/nested/b.txt")).size).toBe(1);
    let threw = false;
    try {
      await provider.getProperties("src");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("constructor rootPath defaults to the unrestricted sentinel", async () => {
    const unrestricted = new FilesystemIOProvider();
    await writeFile(join(root, "outside.txt"), "hello");

    const properties = await unrestricted.getProperties(join(root, "outside.txt"));
    expect(properties.size).toBe(5);
  });
  test("setProperties applies lastModified and ignores an absent properties bag", async () => {
    await writeFile(join(root, "a.txt"), "a");
    const lastModified = new Date(1_000_000_000_000);
    await provider.setProperties("a.txt", { lastModified });
    const properties = await provider.getProperties("a.txt");
    expect(properties.lastModified?.getTime()).toBe(lastModified.getTime());
  });

  test("setProperties rejects a properties bag that fails settablePropertySchema", async () => {
    await writeFile(join(root, "a.txt"), "a");
    await expect(provider.setProperties("a.txt", { properties: { mode: "rw" } })).rejects.toThrow();
  });

  test("joinKey joins with the OS path separator", () => {
    expect(provider.joinKey("dir", "a.txt")).toBe(join("dir", "a.txt"));
  });

  test("a write interrupted after a token is resumed from the committed size", async () => {
    const first = await provider.getWritableStream("resume.txt");
    const firstWriter = (first.stream as WritableStream<Item<PayloadKind.Js>>).getWriter();
    await firstWriter.write({
      payload: { kind: PayloadKind.Js, data: new TextEncoder().encode("hello ") },
    });
    const token = first.resumeToken();
    await firstWriter.abort(new Error("interrupted"));

    const resumed = await provider.getWritableStream("resume.txt", { resume: token });
    expect(resumed.startOffset).toBe(6);
    const writer = (resumed.stream as WritableStream<Item<PayloadKind.Js>>).getWriter();
    await writer.write({
      payload: { kind: PayloadKind.Js, data: new TextEncoder().encode("world") },
    });
    await writer.close();
    expect(await Bun.file(join(root, "resume.txt")).text()).toBe("hello world");
  });
  test("disposal holds no resources and resolves", async () => {
    await provider[Symbol.asyncDispose]();
  });
});
