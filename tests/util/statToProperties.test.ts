import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statToProperties } from "../../src/util/statToProperties.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "io-fs-stat-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("statToProperties", () => {
  test("reports size for a file and no size for a directory", async () => {
    await writeFile(join(root, "a.txt"), "abc");
    const file = await statToProperties(join(root, "a.txt"));
    expect(file.size).toBe(3);
    expect(file.isContainer).toBe(false);
    expect(typeof file.properties.mode).toBe("number");

    const dir = await statToProperties(root);
    expect(dir.isContainer).toBe(true);
    expect(dir.size).toBeUndefined();
  });
});
