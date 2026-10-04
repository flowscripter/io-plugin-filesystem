import { type IOProviderFactory, PayloadKind } from "@flowscripter/pluggable-io-framework-api";
import { FilesystemIOProvider } from "./FilesystemIOProvider.ts";
import { parseFileLocationString } from "./location/parseFileLocationString.ts";
import { toFileProviderInputs } from "./location/toFileProviderInputs.ts";
import { type FilesystemConfig, filesystemConfigSchema } from "./schema/filesystemConfigSchema.ts";
import {
  type FilesystemLocation,
  filesystemLocationSchema,
} from "./schema/filesystemLocationSchema.ts";
import { filesystemPropertySchema } from "./schema/filesystemPropertySchema.ts";
import { filesystemSettablePropertySchema } from "./schema/filesystemSettablePropertySchema.ts";

export const filesystemIOProviderFactory: IOProviderFactory<
  FilesystemConfig,
  PayloadKind.Js,
  FilesystemLocation
> = {
  protocol: "file",
  kind: PayloadKind.Js,
  configSchema: filesystemConfigSchema,
  locationSchema: filesystemLocationSchema,
  propertySchema: filesystemPropertySchema,
  settablePropertySchema: filesystemSettablePropertySchema,
  parseLocationString: parseFileLocationString,
  toProviderInputs: toFileProviderInputs,
  async createProvider(config) {
    return new FilesystemIOProvider(config.rootPath);
  },
};
