import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filesystemIOProviderFactory } from "../src/FilesystemIOProviderFactory.ts";

describe("filesystemIOProviderFactory", () => {
  test("config schema accepts a config with no rootPath, defaulting to unrestricted access", async () => {
    const config = filesystemIOProviderFactory.configSchema.parse({});
    const provider = await filesystemIOProviderFactory.createProvider(config);

    const root = await mkdtemp(join(tmpdir(), "pluggable-io-fs-factory-test-"));
    try {
      await writeFile(join(root, "a.txt"), "hello");
      const properties = await provider.getProperties(join(root, "a.txt"));
      expect(properties.size).toBe(5);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("config schema still accepts an explicit rootPath", () => {
    const config = filesystemIOProviderFactory.configSchema.parse({ rootPath: "/data" });
    expect(config.rootPath).toBe("/data");
  });
});
