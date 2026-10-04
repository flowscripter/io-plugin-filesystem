import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PayloadKind, type ProviderContext } from "@flowscripter/pluggable-io-framework-api";
import { filesystemIOProviderFactory } from "../src/FilesystemIOProviderFactory.ts";

const context: ProviderContext = {
  resolver: {
    createProviderForLocation: () => Promise.reject(new Error("not used")),
  },
};

describe("filesystemIOProviderFactory", () => {
  test("declares the file protocol and js payload kind", () => {
    expect(filesystemIOProviderFactory.protocol).toBe("file");
    expect(filesystemIOProviderFactory.kind).toBe(PayloadKind.Js);
  });

  test("config schema accepts a config with no rootPath, defaulting to unrestricted access", async () => {
    const config = filesystemIOProviderFactory.configSchema.parse({});
    const provider = await filesystemIOProviderFactory.createProvider(config, context);

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

  test("parses a file URL into an entry target via the location schema", () => {
    const raw = filesystemIOProviderFactory.parseLocationString("file:///tmp") as object;
    const location = filesystemIOProviderFactory.locationSchema.parse({
      ...raw,
      filename: "a.txt",
    });
    const { config, target } = filesystemIOProviderFactory.toProviderInputs(location);
    expect(config).toEqual({ rootPath: "" });
    expect(target).toEqual({ kind: "entry", key: join(location.path, "a.txt") });
  });
});
