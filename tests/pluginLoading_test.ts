import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DefaultPluginManager,
  LocalFolderPluginRepository,
} from "@flowscripter/dynamic-plugin-framework";
import {
  ChunkKind,
  PLUGGABLE_IO_FRAMEWORK_PROVIDER_FACTORY_EXTENSION_POINT,
  type IOProviderFactory,
  type JsChunk,
} from "@flowscripter/pluggable-io-framework-api";

const packageRoot = resolve(import.meta.dir, "..");
const bundlePath = join(packageRoot, "dist", "bundle.js");

let dataDir: string;
let pluginFolder: string;
let repository: LocalFolderPluginRepository;

beforeAll(async () => {
  // Build the real bundle so this test proves loading actual compiled/minified
  // output through dynamic-plugin-framework's import(), not just source via tsc.
  const build = Bun.spawnSync(
    [
      "bun",
      "build",
      "index.ts",
      "--outdir",
      "./dist",
      "--entry-naming",
      "bundle.js",
      "--target",
      "bun",
      "--minify",
      "--external",
      "@flowscripter/dynamic-plugin-framework",
    ],
    { cwd: packageRoot },
  );
  if (build.exitCode !== 0) {
    throw new Error(`Plugin bundle build failed: ${build.stderr.toString()}`);
  }

  dataDir = await mkdtemp(join(tmpdir(), "pluggable-io-fs-plugin-data-"));
  pluginFolder = await mkdtemp(join(tmpdir(), "pluggable-io-fs-plugin-repo-"));
  repository = new LocalFolderPluginRepository(pluginFolder, "manifest.json");
  await repository.writeManifest([
    {
      pluginId: "pluggable-io-framework-plugin-filesystem",
      bundlePath,
      extensionPoints: [PLUGGABLE_IO_FRAMEWORK_PROVIDER_FACTORY_EXTENSION_POINT],
      name: "pluggable-io-framework-plugin-filesystem",
      version: "0.1.0",
    },
  ]);
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(pluginFolder, { recursive: true, force: true });
});

describe("dynamic loading via dynamic-plugin-framework", () => {
  test("discovers and instantiates the filesystem provider factory through a real import()", async () => {
    const pluginManager = new DefaultPluginManager([repository]);
    await pluginManager.registerExtensions(PLUGGABLE_IO_FRAMEWORK_PROVIDER_FACTORY_EXTENSION_POINT);

    const extensions = await pluginManager.getRegisteredExtensions(
      PLUGGABLE_IO_FRAMEWORK_PROVIDER_FACTORY_EXTENSION_POINT,
    );
    expect(extensions.length).toBe(1);

    const factory = (await pluginManager.instantiate(
      extensions[0]!.extensionHandle,
    )) as IOProviderFactory;
    expect(typeof factory.createProvider).toBe("function");

    const config = factory.configSchema.parse({ rootPath: dataDir });
    const provider = await factory.createProvider(config);

    const writable = await provider.getWritableStream("via-plugin.txt");
    const writer = (writable.stream as WritableStream<JsChunk>).getWriter();
    await writer.write({
      kind: ChunkKind.Js,
      data: new TextEncoder().encode("loaded dynamically"),
    });
    await writer.close();

    const readable = await provider.getReadableStream("via-plugin.txt");
    const reader = (readable.stream as ReadableStream<JsChunk>).getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value?.data)).toBe("loaded dynamically");

    await provider[Symbol.asyncDispose]();
  });
});
