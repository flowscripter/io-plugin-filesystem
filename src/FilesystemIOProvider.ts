import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  utimes,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import {
  ChunkKind,
  fromWebReadableStream,
  type IOProvider,
  type ItemProperties,
  type JsChunk,
  type Part,
  type StreamHandle,
} from "@flowscripter/pluggable-io-framework-api";
import { z } from "zod";
import { resolvePath } from "./resolvePath.ts";

export const filesystemPropertySchema = z.object({ mode: z.number().optional() });

const DEFAULT_PART_SIZE = 8 * 1024 * 1024;

async function statToProperties(fullPath: string): Promise<ItemProperties> {
  const stats = await stat(fullPath);
  const isFolder = stats.isDirectory();
  return {
    size: isFolder ? undefined : stats.size,
    lastModified: stats.mtime,
    isFolder,
    properties: { mode: stats.mode },
  };
}

async function* walk(rootPath: string, relDir: string, recursive: boolean): AsyncGenerator<string> {
  const entries = await readdir(join(rootPath, relDir), { withFileTypes: true });
  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    yield relPath;
    if (entry.isDirectory() && recursive) {
      yield* walk(rootPath, relPath, recursive);
    }
  }
}

/**
 * Local filesystem source/sink provider. All paths are resolved and
 * sandboxed against `rootPath` via {@link resolvePath} - a path that would
 * escape the root is rejected rather than followed. `rootPath === ""` means
 * "no restriction" (see {@link resolvePath}) - preserved here rather than
 * eagerly resolved, since `resolve("")` would otherwise collapse it to
 * `cwd` before `resolvePath` ever sees the sentinel.
 */
export class FilesystemIOProvider implements IOProvider {
  public readonly kind = ChunkKind.Js;
  public readonly rootPath: string;

  public constructor(rootPath: string) {
    this.rootPath = rootPath === "" ? "" : resolve(rootPath);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    // No persistent OS handles held between calls - nothing to release.
  }

  public list(
    path: string,
    options?: { recursive?: boolean; regex?: RegExp },
  ): AsyncIterable<{ path: string; properties: ItemProperties }> {
    const rootPath = this.rootPath;
    const startDir = resolvePath(rootPath, path);
    async function* generate(): AsyncGenerator<{ path: string; properties: ItemProperties }> {
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

  public async getProperties(path: string): Promise<ItemProperties> {
    return statToProperties(resolvePath(this.rootPath, path));
  }

  public async setProperties(
    path: string,
    properties: Partial<Record<string, unknown>>,
  ): Promise<void> {
    const fullPath = resolvePath(this.rootPath, path);
    const parsed = filesystemPropertySchema.partial().parse(properties);
    if (parsed.mode !== undefined) {
      await chmod(fullPath, parsed.mode);
    }
    if (properties.lastModified instanceof Date) {
      await utimes(fullPath, properties.lastModified, properties.lastModified);
    }
  }

  public async delete(path: string): Promise<void> {
    await rm(resolvePath(this.rootPath, path), { recursive: true, force: false });
  }

  public async getReadableStream(path: string): Promise<StreamHandle<ChunkKind>> {
    const fullPath = resolvePath(this.rootPath, path);
    const webStream = Readable.toWeb(
      createReadStream(fullPath),
    ) as unknown as ReadableStream<Uint8Array>;
    return { kind: ChunkKind.Js, stream: fromWebReadableStream(webStream) };
  }

  public async getWritableStream(path: string): Promise<StreamHandle<ChunkKind>> {
    const fullPath = resolvePath(this.rootPath, path);
    await mkdir(join(fullPath, ".."), { recursive: true });
    const nodeStream = createWriteStream(fullPath);
    const stream = new WritableStream<JsChunk>({
      write(chunk) {
        return new Promise<void>((res, rej) => {
          nodeStream.write(chunk.data, (error) => (error ? rej(error) : res()));
        });
      },
      close() {
        return new Promise<void>((res, rej) => {
          nodeStream.end((error?: Error | null) => (error ? rej(error) : res()));
        });
      },
      abort(reason) {
        nodeStream.destroy(reason instanceof Error ? reason : new Error(String(reason)));
      },
    });
    return { kind: ChunkKind.Js, stream };
  }

  public getMultipartReader(path: string): AsyncIterable<Part<ChunkKind>> {
    const fullPath = resolvePath(this.rootPath, path);
    async function* generate(): AsyncGenerator<Part<ChunkKind>> {
      const stats = await stat(fullPath);
      const partCount = Math.max(1, Math.ceil(stats.size / DEFAULT_PART_SIZE));
      for (let index = 0; index < partCount; index += 1) {
        const start = index * DEFAULT_PART_SIZE;
        const end = Math.min(start + DEFAULT_PART_SIZE, stats.size) - 1;
        const webStream = Readable.toWeb(
          createReadStream(fullPath, { start, end: Math.max(start, end) }),
        ) as unknown as ReadableStream<Uint8Array>;
        yield {
          index,
          offset: start,
          kind: ChunkKind.Js,
          stream: fromWebReadableStream(webStream),
          complete: async () => {},
        };
      }
    }
    return generate();
  }

  public getMultipartWriter(path: string): {
    write(parts: AsyncIterable<Part<ChunkKind>>): Promise<void>;
  } {
    const fullPath = resolvePath(this.rootPath, path);
    return {
      async write(parts: AsyncIterable<Part<ChunkKind>>): Promise<void> {
        await mkdir(join(fullPath, ".."), { recursive: true });
        const handle = await open(fullPath, "w");
        try {
          const writes: Promise<void>[] = [];
          for await (const part of parts) {
            writes.push(
              (async () => {
                const reader = (part.stream as ReadableStream<JsChunk>).getReader();
                let position = part.offset;
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  await handle.write(value.data, 0, value.data.byteLength, position);
                  position += value.data.byteLength;
                }
                await part.complete();
              })(),
            );
          }
          await Promise.all(writes);
        } finally {
          await handle.close();
        }
      },
    };
  }

  public canDirectTransfer(other: IOProvider): boolean {
    return other instanceof FilesystemIOProvider && other.rootPath === this.rootPath;
  }

  public async directCopy(sourcePath: string, destPath: string): Promise<void> {
    const fullDest = resolvePath(this.rootPath, destPath);
    await mkdir(join(fullDest, ".."), { recursive: true });
    await copyFile(resolvePath(this.rootPath, sourcePath), fullDest);
  }

  public async directMove(sourcePath: string, destPath: string): Promise<void> {
    const fullSource = resolvePath(this.rootPath, sourcePath);
    const fullDest = resolvePath(this.rootPath, destPath);
    await mkdir(join(fullDest, ".."), { recursive: true });
    try {
      await rename(fullSource, fullDest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EXDEV") {
        await copyFile(fullSource, fullDest);
        await unlink(fullSource);
        return;
      }
      throw error;
    }
  }
}
