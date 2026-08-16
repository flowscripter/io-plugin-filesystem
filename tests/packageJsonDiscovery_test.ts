import { describe, expect, test } from "bun:test";
import packageJson from "../package.json";

const PACKAGE_JSON_NAMESPACE = "pluggable-io-framework";

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
