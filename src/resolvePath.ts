import { lstatSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Resolves `relativePath` against `rootPath`, rejecting any path that
 * escapes the root (e.g. `../../etc/passwd`). Every method that accepts a
 * path from a caller must go through this before touching the filesystem.
 *
 * Containment is checked both lexically and against the real filesystem
 * location: symlinks under the root that point outside it are rejected, as
 * are dangling symlinks. Paths that do not exist yet (e.g. a file about to be
 * created) are checked via their deepest existing ancestor.
 *
 * `rootPath === ""` means "no restriction" - full filesystem access. This
 * is an explicit sentinel rather than e.g. `"/"`, because POSIX `"/"` isn't
 * a meaningful "everything" root on Windows, which has multiple drive
 * letters and no single filesystem root.
 */
export function resolvePath(rootPath: string, relativePath: string): string {
  if (rootPath === "") {
    return resolve(relativePath);
  }
  const resolvedRoot = resolve(rootPath);
  const resolvedPath = resolve(resolvedRoot, relativePath);
  if (!isWithin(resolvedRoot, resolvedPath)) {
    throw new Error(`Path "${relativePath}" resolves outside provider root "${rootPath}"`);
  }
  if (!isWithin(realpathOrSelf(resolvedRoot), realPathOf(resolvedPath))) {
    throw new Error(`Path "${relativePath}" resolves outside provider root "${rootPath}"`);
  }
  return resolvedPath;
}

function isWithin(root: string, path: string): boolean {
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  return path === root || path.startsWith(rootPrefix);
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Real path of `path`, following symlinks. For a path that does not exist,
 * the deepest existing ancestor is resolved and the remainder re-appended.
 * A dangling symlink is returned as an unresolvable marker that never lies
 * within any root.
 */
function realPathOf(path: string): string {
  try {
    return realpathSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
  let isLink = false;
  try {
    isLink = lstatSync(path).isSymbolicLink();
  } catch {
    // path itself does not exist
  }
  if (isLink) {
    return "";
  }
  const parent = dirname(path);
  if (parent === path) {
    return path;
  }
  const realParent = realPathOf(parent);
  return realParent === "" ? "" : join(realParent, path.slice(parent.length + 1));
}
