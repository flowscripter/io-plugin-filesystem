import { describe, expect, test } from "bun:test";
import { filesystemSettablePropertySchema } from "../../src/schema/filesystemSettablePropertySchema.ts";

describe("filesystemSettablePropertySchema", () => {
  test("accepts mode and rejects a non-numeric mode", () => {
    expect(filesystemSettablePropertySchema.parse({ mode: 0o600 })).toEqual({ mode: 0o600 });
    expect(filesystemSettablePropertySchema.safeParse({ mode: "rw" }).success).toBe(false);
  });
});
