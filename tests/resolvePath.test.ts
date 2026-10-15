import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
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

describe("resolvePath symlink containment", () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), "resolve-path-")));
    root = join(base, "root");
    outside = join(base, "outside");
    mkdirSync(root);
    mkdirSync(join(root, "inner"));
    mkdirSync(outside);
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  const link = (target: string, path: string) =>
    symlinkSync(target, path, process.platform === "win32" ? "junction" : undefined);

  test("rejects a symlinked directory pointing outside the root", () => {
    link(outside, join(root, "escape"));
    expect(() => resolvePath(root, "escape")).toThrow();
    expect(() => resolvePath(root, "escape/file.txt")).toThrow();
  });

  test("rejects a not-yet-existing path beneath an escaping symlink", () => {
    link(outside, join(root, "escape"));
    expect(() => resolvePath(root, "escape/new/deeper/file.txt")).toThrow();
  });

  test("rejects a dangling symlink", () => {
    link(join(outside, "missing"), join(root, "dangling"));
    expect(() => resolvePath(root, "dangling")).toThrow();
  });

  test("rejects a symlink chain that ends outside the root", () => {
    link(outside, join(base, "hop"));
    link(join(base, "hop"), join(root, "escape"));
    expect(() => resolvePath(root, "escape")).toThrow();
  });

  test("accepts a symlink that stays within the root", () => {
    link(join(root, "inner"), join(root, "alias"));
    expect(resolvePath(root, "alias/file.txt")).toBe(join(root, "alias", "file.txt"));
  });

  test("accepts a not-yet-existing path within the root", () => {
    expect(resolvePath(root, "inner/new/file.txt")).toBe(join(root, "inner", "new", "file.txt"));
  });

  test("accepts a root that is itself a symlink", () => {
    const rootLink = join(base, "root-link");
    link(root, rootLink);
    expect(resolvePath(rootLink, "inner")).toBe(join(rootLink, "inner"));
    expect(() => resolvePath(rootLink, "../outside")).toThrow();
  });

  test('rootPath "" does not restrict symlinks', () => {
    link(outside, join(root, "escape"));
    expect(resolvePath("", join(root, "escape"))).toBe(join(root, "escape"));
  });
});
