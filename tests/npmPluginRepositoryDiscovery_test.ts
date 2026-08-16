import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DefaultPluginManager, NpmPluginRepository } from "@flowscripter/dynamic-plugin-framework";
import {
  PLUGGABLE_IO_FRAMEWORK_PROVIDER_FACTORY_EXTENSION_POINT,
  type IOProviderFactory,
} from "@flowscripter/pluggable-io-framework-api";

const packageRoot = resolve(import.meta.dir, "..");

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

describe("NpmPluginRepository discovery", () => {
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
