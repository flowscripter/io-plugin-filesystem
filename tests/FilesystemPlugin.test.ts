import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DefaultPluginManager,
  LocalFolderPluginRepository,
  NpmPluginRepository,
} from "@flowscripter/dynamic-plugin-framework";
import {
  type IOProviderFactory,
  type Item,
  PLUGGABLE_IO_FRAMEWORK_PROVIDER_FACTORY_EXTENSION_POINT,
  PayloadKind,
} from "@flowscripter/pluggable-io-framework-api";
import packageJson from "../package.json";
import filesystemPlugin from "../src/FilesystemPlugin.ts";
import { filesystemIOProviderFactory } from "../src/FilesystemIOProviderFactory.ts";

const packageRoot = resolve(import.meta.dir, "..");
const PACKAGE_JSON_NAMESPACE = "pluggable-io-framework";

describe("filesystemPlugin", () => {
  test("registers the filesystem provider factory on the provider factory extension point", async () => {
    const [descriptor] = filesystemPlugin.extensionDescriptors;
    expect(descriptor?.extensionPoint).toBe(
      PLUGGABLE_IO_FRAMEWORK_PROVIDER_FACTORY_EXTENSION_POINT,
    );
    expect(await descriptor?.factory.create()).toBe(filesystemIOProviderFactory);
  });
});

describe("dynamic loading via dynamic-plugin-framework", () => {
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
        pluginId: "io-plugin-filesystem",
        bundlePath,
        extensionPoints: [PLUGGABLE_IO_FRAMEWORK_PROVIDER_FACTORY_EXTENSION_POINT],
        name: "io-plugin-filesystem",
        version: "0.1.0",
      },
    ]);
  });

  afterAll(async () => {
    await rm(dataDir, { recursive: true, force: true });
    await rm(pluginFolder, { recursive: true, force: true });
  });

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
    const provider = await factory.createProvider(config, {
      resolver: { createProviderForLocation: () => Promise.reject(new Error("not used")) },
    });

    const writable = await provider.getWritableStream("via-plugin.txt");
    const writer = (writable.stream as WritableStream<Item<PayloadKind.Js>>).getWriter();
    await writer.write({
      payload: { kind: PayloadKind.Js, data: new TextEncoder().encode("loaded dynamically") },
    });
    await writer.close();

    const readable = await provider.getReadableStream("via-plugin.txt");
    const reader = (readable.stream as ReadableStream<Item<PayloadKind.Js>>).getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value?.payload.data)).toBe("loaded dynamically");

    await provider[Symbol.asyncDispose]();
  });
});

describe("NpmPluginRepository discovery", () => {
  let nodeModulesPath: string;

  beforeAll(async () => {
    // Simulate what `dynamic-cli-framework`'s plugin service installs into a
    // consumer CLI's local plugin store: a scoped package directory inside
    // some nodeModulesPath, discoverable by NpmPluginRepository without any
    // npm install/publish involved.
    nodeModulesPath = await mkdtemp(join(tmpdir(), "io-plugin-filesystem-npm-repo-test-"));
    await mkdir(join(nodeModulesPath, "@flowscripter"), { recursive: true });
    await symlink(
      packageRoot,
      join(nodeModulesPath, "@flowscripter", "io-plugin-filesystem"),
      "junction",
    );
  });

  afterAll(async () => {
    await rm(nodeModulesPath, { recursive: true, force: true });
  });

  test("discovers and instantiates the provider factory via the packageJsonNamespace field", async () => {
    const repository = new NpmPluginRepository({
      nodeModulesPath,
      packageJsonNamespace: "pluggable-io-framework",
    });

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
  });
});

describe("package.json plugin discovery metadata", () => {
  // NpmjsPluginRepository.getPlugin() (used by dynamic-cli-framework's
  // `plugin:add`/checkAvailable against the real npm registry) requires
  // BOTH of these independently - it gates on `keywords` including the
  // packageJsonNamespace before it will even look at the namespace field.
  // NpmPluginRepository (local node_modules scan) only checks the
  // namespace field, so a local-only test can't catch a missing keyword.
  test("keywords includes the packageJsonNamespace", () => {
    expect(packageJson.keywords).toContain(PACKAGE_JSON_NAMESPACE);
  });

  test("declares extensionPoints under the packageJsonNamespace field", () => {
    const namespaceData = (
      packageJson as unknown as Record<string, { extensionPoints?: string[] }>
    )[PACKAGE_JSON_NAMESPACE];
    expect(namespaceData?.extensionPoints?.length).toBeGreaterThan(0);
  });
});
