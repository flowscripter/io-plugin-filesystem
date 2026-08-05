import { describe, expect, test } from "bun:test";
import { resolvePath } from "../src/resolvePath.ts";

describe("resolvePath", () => {
  test("resolves a relative path against a normal root", () => {
    expect(resolvePath("/tmp/root", "a.txt")).toBe("/tmp/root/a.txt");
  });

  test("rejects a path that escapes the root", () => {
    expect(() => resolvePath("/tmp/root", "../../etc/passwd")).toThrow();
  });

  test("accepts any absolute path when root is the filesystem root", () => {
    expect(resolvePath("/", "/tmp/somewhere/file.txt")).toBe("/tmp/somewhere/file.txt");
  });

  test("accepts the root path itself", () => {
    expect(resolvePath("/tmp/root", ".")).toBe("/tmp/root");
    expect(resolvePath("/", ".")).toBe("/");
  });
});
