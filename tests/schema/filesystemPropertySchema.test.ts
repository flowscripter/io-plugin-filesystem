import { describe, expect, test } from "bun:test";
import { filesystemPropertySchema } from "../../src/schema/filesystemPropertySchema.ts";

describe("filesystemPropertySchema", () => {
  test("accepts a numeric mode", () => {
    expect(filesystemPropertySchema.parse({ mode: 0o644 })).toEqual({ mode: 0o644 });
  });
});
