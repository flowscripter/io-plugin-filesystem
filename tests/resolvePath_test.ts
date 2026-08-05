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
});
