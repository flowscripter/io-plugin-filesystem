import { PLUGGABLE_IO_FRAMEWORK_PROVIDER_FACTORY_EXTENSION_POINT } from "@flowscripter/pluggable-io-framework-api";
import type {
  ExtensionDescriptor,
  ExtensionFactory,
  Plugin,
} from "@flowscripter/dynamic-plugin-framework/plugin";
import { filesystemIOProviderFactory } from "./FilesystemIOProviderFactory.ts";

const filesystemExtensionFactory: ExtensionFactory = {
  create: () => Promise.resolve(filesystemIOProviderFactory),
};

const filesystemExtensionDescriptor: ExtensionDescriptor = {
  extensionPoint: PLUGGABLE_IO_FRAMEWORK_PROVIDER_FACTORY_EXTENSION_POINT,
  factory: filesystemExtensionFactory,
};

const filesystemPlugin: Plugin = {
  extensionDescriptors: [filesystemExtensionDescriptor],
};

export default filesystemPlugin;
