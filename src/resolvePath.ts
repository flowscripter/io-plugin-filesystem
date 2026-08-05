import { resolve, sep } from "node:path";

/**
 * Resolves `relativePath` against `rootPath`, rejecting any path that
 * escapes the root (e.g. `../../etc/passwd`). Every method that accepts a
 * path from a caller must go through this before touching the filesystem.
 */
export function resolvePath(rootPath: string, relativePath: string): string {
  const resolvedRoot = resolve(rootPath);
  const resolvedPath = resolve(resolvedRoot, relativePath);
  const rootPrefix = resolvedRoot.endsWith(sep) ? resolvedRoot : resolvedRoot + sep;
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(rootPrefix)) {
    throw new Error(`Path "${relativePath}" resolves outside provider root "${rootPath}"`);
  }
  return resolvedPath;
}
