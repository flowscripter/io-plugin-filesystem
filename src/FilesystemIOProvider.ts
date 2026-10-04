import { chmod, cp, mkdir, rename, rm, utimes } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type EntryProperties,
  type EntryPropertyChanges,
  type IOProvider,
  type Part,
  type PartSizeConstraints,
  PayloadKind,
  type RangeReadable,
  type ResumableWritable,
  type ResumeToken,
  type StreamHandle,
  type TransferTelemetry,
} from "@flowscripter/pluggable-io-framework-api";
import { resolvePath } from "./resolvePath.ts";
import { filesystemSettablePropertySchema } from "./schema/filesystemSettablePropertySchema.ts";
import { createMultipartWriter } from "./stream/createMultipartWriter.ts";
import { createReadableHandle } from "./stream/createReadableHandle.ts";
import { createWritableHandle } from "./stream/createWritableHandle.ts";
import { statToProperties } from "./util/statToProperties.ts";
import { walk } from "./util/walk.ts";

const DEFAULT_PART_SIZE = 8 * 1024 * 1024;

/**
 * Local filesystem source/sink provider. All paths are resolved and
 * sandboxed against `rootPath` via {@link resolvePath} - a path that would
 * escape the root is rejected rather than followed. `rootPath === ""` means
 * "no restriction" (see {@link resolvePath}) - preserved here rather than
 * eagerly resolved, since `resolve("")` would otherwise collapse it to
 * `cwd` before `resolvePath` ever sees the sentinel.
 */
export class FilesystemIOProvider implements IOProvider<PayloadKind.Js> {
  public readonly kind = PayloadKind.Js;
  public readonly rootPath: string;

  public constructor(rootPath: string = "") {
    this.rootPath = rootPath === "" ? "" : resolve(rootPath);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    // No persistent OS handles held between calls - nothing to release.
  }

  public async createContainer(path: string): Promise<void> {
    await mkdir(resolvePath(this.rootPath, path), { recursive: true });
  }

  public joinKey(containerKey: string, name: string): string {
    return join(containerKey, name);
  }

  public list(
    path: string,
    options?: { recursive?: boolean; regex?: RegExp },
  ): AsyncIterable<{ path: string; properties: EntryProperties }> {
    const rootPath = this.rootPath;
    const startDir = resolvePath(rootPath, path);
    async function* generate(): AsyncGenerator<{ path: string; properties: EntryProperties }> {
      for await (const relPath of walk(startDir, "", options?.recursive ?? false)) {
        if (options?.regex && !options.regex.test(relPath)) {
          continue;
        }
        const properties = await statToProperties(join(startDir, relPath));
        yield { path: relPath, properties };
      }
    }
    return generate();
  }

  public async getProperties(path: string): Promise<EntryProperties> {
    return statToProperties(resolvePath(this.rootPath, path));
  }

  public async setProperties(path: string, changes: EntryPropertyChanges): Promise<void> {
    const fullPath = resolvePath(this.rootPath, path);
    const properties = filesystemSettablePropertySchema.parse(changes.properties ?? {});
    if (properties.mode !== undefined) {
      await chmod(fullPath, properties.mode);
    }
    if (changes.lastModified !== undefined) {
      await utimes(fullPath, changes.lastModified, changes.lastModified);
    }
  }

  public async delete(path: string): Promise<void> {
    await rm(resolvePath(this.rootPath, path), { recursive: true, force: false });
  }

  public async getReadableStream(
    path: string,
  ): Promise<StreamHandle<PayloadKind.Js> & RangeReadable<PayloadKind.Js>> {
    return createReadableHandle(resolvePath(this.rootPath, path));
  }

  public async getWritableStream(
    path: string,
    opts?: { resume?: ResumeToken },
  ): Promise<StreamHandle<PayloadKind.Js> & ResumableWritable & { readonly startOffset: number }> {
    return createWritableHandle(resolvePath(this.rootPath, path), opts?.resume);
  }

  public getPartSizeConstraints(_totalSize: number): PartSizeConstraints {
    // The local filesystem imposes no real part-size limits.
    return {
      minPartSize: 0,
      maxPartSize: Infinity,
      maxParts: Infinity,
      defaultPartSize: DEFAULT_PART_SIZE,
    };
  }

  public getMultipartWriter(
    path: string,
    _partSize: number,
  ): { write(parts: AsyncIterable<Part<PayloadKind.Js>>): Promise<void> } {
    return createMultipartWriter(resolvePath(this.rootPath, path));
  }

  public canDirectTransfer(other: IOProvider): boolean {
    return other instanceof FilesystemIOProvider && other.rootPath === this.rootPath;
  }

  /** `directCopy`/`directMove` accept a directory `sourcePath` and recurse internally. */
  public readonly supportsRecursiveDirectTransfer = true;

  public async directCopy(
    sourcePath: string,
    destPath: string,
    _telemetry?: TransferTelemetry,
  ): Promise<void> {
    const fullDest = resolvePath(this.rootPath, destPath);
    await mkdir(join(fullDest, ".."), { recursive: true });
    await cp(resolvePath(this.rootPath, sourcePath), fullDest, { recursive: true });
  }

  public async directMove(
    sourcePath: string,
    destPath: string,
    _telemetry?: TransferTelemetry,
  ): Promise<void> {
    const fullSource = resolvePath(this.rootPath, sourcePath);
    const fullDest = resolvePath(this.rootPath, destPath);
    await mkdir(join(fullDest, ".."), { recursive: true });
    try {
      await rename(fullSource, fullDest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EXDEV") {
        await cp(fullSource, fullDest, { recursive: true });
        await rm(fullSource, { recursive: true, force: false });
        return;
      }
      throw error;
    }
  }
}
