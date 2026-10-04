import { z } from "zod";

/**
 * Provider config. `rootPath` sandboxes every path the provider touches;
 * omitted or `""` means unrestricted access (see `resolvePath`).
 */
export const filesystemConfigSchema = z.object({ rootPath: z.string().optional() });

export type FilesystemConfig = z.infer<typeof filesystemConfigSchema>;
