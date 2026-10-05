import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { toFileProviderInputs } from "../../src/location/toFileProviderInputs.ts";

describe("toFileProviderInputs", () => {
  test("filename gives an entry target joined with the OS separator", () => {
    expect(toFileProviderInputs({ path: "/data", filename: "a.txt" })).toEqual({
      config: { rootPath: "" },
      target: { kind: "entry", key: join("/data", "a.txt") },
    });
  });

  test("pattern gives a pattern target", () => {
    expect(toFileProviderInputs({ path: "/data", pattern: "*.txt" })).toEqual({
      config: { rootPath: "" },
      target: { kind: "pattern", containerKey: "/data", pattern: "*.txt" },
    });
  });

  test("neither gives a container target", () => {
    expect(toFileProviderInputs({ path: "/data" })).toEqual({
      config: { rootPath: "" },
      target: { kind: "container", key: "/data" },
    });
  });
});
