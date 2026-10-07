import { join } from "node:path";
import type { LocationTarget } from "@flowscripter/pluggable-io-framework-api";
import type { FilesystemConfig } from "../schema/filesystemConfigSchema.ts";
import type { FilesystemLocation } from "../schema/filesystemLocationSchema.ts";

/**
 * Splits a validated `file` location into an unrestricted provider config
 * and a `LocationTarget`, joining `path` and `filename` with the OS
 * path separator.
 */
export function toFileProviderInputs(location: FilesystemLocation): {
  config: FilesystemConfig;
  target: LocationTarget;
} {
  const config = { rootPath: "" };
  if (location.filename !== undefined) {
    return { config, target: { kind: "entry", key: join(location.path, location.filename) } };
  }
  if (location.pattern !== undefined) {
    return {
      config,
      target: { kind: "pattern", containerKey: location.path, pattern: location.pattern },
    };
  }
  return { config, target: { kind: "container", key: location.path } };
}
