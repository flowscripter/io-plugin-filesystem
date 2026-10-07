import { describe, expect, test } from "bun:test";
import { filesystemConfigSchema } from "../../src/schema/filesystemConfigSchema.ts";

describe("filesystemConfigSchema", () => {
  test("rootPath is optional", () => {
    expect(filesystemConfigSchema.parse({})).toEqual({});
    expect(filesystemConfigSchema.safeParse({ rootPath: 1 }).success).toBe(false);
  });
});
