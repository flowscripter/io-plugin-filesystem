import { describe, expect, test } from "bun:test";
import { filesystemLocationSchema } from "../../src/schema/filesystemLocationSchema.ts";

describe("filesystemLocationSchema", () => {
  test("defaults path to /", () => {
    expect(filesystemLocationSchema.parse({})).toEqual({ path: "/" });
  });

  test("rejects filename together with pattern", () => {
    expect(
      filesystemLocationSchema.safeParse({ path: "/", filename: "a", pattern: "*" }).success,
    ).toBe(false);
  });

  test("exposes path, filename and pattern as top-level fields", () => {
    expect(Object.keys(filesystemLocationSchema.shape).sort()).toEqual([
      "filename",
      "path",
      "pattern",
    ]);
  });
});
