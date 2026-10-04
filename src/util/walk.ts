import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** Yields `/`-separated paths relative to `rootPath`, depth-first. */
export async function* walk(
  rootPath: string,
  relDir: string,
  recursive: boolean,
): AsyncGenerator<string> {
  const entries = await readdir(join(rootPath, relDir), { withFileTypes: true });
  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    yield relPath;
    if (entry.isDirectory() && recursive) {
      yield* walk(rootPath, relPath, recursive);
    }
  }
}
