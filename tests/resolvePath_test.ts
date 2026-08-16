import { describe, expect, test } from "bun:test";
import { resolve, sep } from "node:path";
import { resolvePath } from "../src/resolvePath.ts";

describe("resolvePath", () => {
  test("resolves a relative path against a normal root", () => {
    const root = resolve("some", "root");
    expect(resolvePath(root, "a.txt")).toBe(resolve(root, "a.txt"));
  });

  test("rejects a path that escapes the root", () => {
    const root = resolve("some", "root");
    expect(() => resolvePath(root, "../../etc/passwd")).toThrow();
  });

  test("accepts any absolute path when root is the filesystem root", () => {
    // resolve(sep) is "/" on POSIX and a drive root (e.g. "D:\") on Windows -
    // both end with the platform separator, which is exactly what triggers
    // the double-separator bug this test guards against.
    const filesystemRoot = resolve(sep);
    const absolutePath = resolve(filesystemRoot, "tmp", "somewhere", "file.txt");
    expect(resolvePath(filesystemRoot, absolutePath)).toBe(absolutePath);
  });

  test("accepts the root path itself", () => {
    const root = resolve("some", "root");
    expect(resolvePath(root, ".")).toBe(root);

    const filesystemRoot = resolve(sep);
    expect(resolvePath(filesystemRoot, ".")).toBe(filesystemRoot);
  });

  test('rootPath "" accepts any absolute path, including ones outside resolve(sep)', () => {
    // resolve(sep) only spans the current drive on Windows - the "" sentinel
    // must genuinely mean "no restriction" everywhere, not just within one
    // drive's root. Simulate a path on a different drive than cwd's.
    const otherDrivePath =
      process.platform === "win32" ? "E:\\somewhere\\file.txt" : "/somewhere/file.txt";
    expect(resolvePath("", otherDrivePath)).toBe(resolve(otherDrivePath));
  });

  test('rootPath "" resolves a relative path against cwd, like plain resolve()', () => {
    expect(resolvePath("", "a.txt")).toBe(resolve("a.txt"));
  });
});
