import type { IOProviderFactory } from "@flowscripter/pluggable-io-framework-api";
import { z } from "zod";
import { FilesystemIOProvider, filesystemPropertySchema } from "./FilesystemIOProvider.ts";

export const filesystemConfigSchema = z.object({ rootPath: z.string() });

export const filesystemIOProviderFactory: IOProviderFactory<
  z.infer<typeof filesystemConfigSchema>
> = {
  configSchema: filesystemConfigSchema,
  propertySchema: filesystemPropertySchema,
  async createProvider(config) {
    return new FilesystemIOProvider(config.rootPath);
  },
};
