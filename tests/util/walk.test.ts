import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walk } from "../../src/util/walk.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "io-fs-walk-test-"));
  await writeFile(join(root, "a.txt"), "a");
  await mkdir(join(root, "sub"));
  await writeFile(join(root, "sub", "b.txt"), "b");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function collect(recursive: boolean): Promise<string[]> {
  const paths: string[] = [];
  for await (const path of walk(root, "", recursive)) {
    paths.push(path);
  }
  return paths.sort();
}

describe("walk", () => {
  test("lists only the top level when not recursive", async () => {
    expect(await collect(false)).toEqual(["a.txt", "sub"]);
  });

  test("descends with /-separated paths when recursive", async () => {
    expect(await collect(true)).toEqual(["a.txt", "sub", "sub/b.txt"]);
  });
});
