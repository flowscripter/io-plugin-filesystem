# io-plugin-filesystem

[![version](https://img.shields.io/github/v/release/flowscripter/io-plugin-filesystem?sort=semver)](https://github.com/flowscripter/io-plugin-filesystem/releases)
[![build](https://img.shields.io/github/actions/workflow/status/flowscripter/io-plugin-filesystem/release-bun-library.yml)](https://github.com/flowscripter/io-plugin-filesystem/actions/workflows/release-bun-library.yml)
[![docs](https://img.shields.io/badge/docs-API-blue)](https://flowscripter.github.io/io-plugin-filesystem/index.html)
[![license: MIT](https://img.shields.io/github/license/flowscripter/io-plugin-filesystem)](https://github.com/flowscripter/io-plugin-filesystem/blob/main/LICENSE)

> Local filesystem source/sink plugin for
> [pluggable-io-framework](https://github.com/flowscripter/pluggable-io-framework),
> loaded via
> [dynamic-plugin-framework](https://github.com/flowscripter/dynamic-plugin-framework)

## Key Features

- Implements the `IOProviderFactory`/`IOProvider` contract from
  [pluggable-io-framework-api](https://github.com/flowscripter/pluggable-io-framework-api)
  for the local filesystem - both source and sink.
- Config: `{ rootPath: string }` (validated with Zod). All paths passed to
  provider methods are resolved and sandboxed against `rootPath` - a path
  that would escape the root (e.g. `../../etc/passwd`) is rejected.
- `list` (recursive, regex-filterable), `getProperties`/`setProperties`
  (size/lastModified/isFolder plus a `mode` extension property),
  `delete`, plain readable/writable streams, and multipart read/write
  (concurrent byte-range parts written directly to file offsets via a
  single shared file handle).
- `canDirectTransfer`/`directCopy`/`directMove`: two `FilesystemIOProvider`
  instances with the same `rootPath` copy/move directly (`copyFile`/
  `rename`, with an `EXDEV` cross-device fallback to copy+unlink) instead of
  streaming.
- Bundled (`bun build --target bun`) as a single-file plugin, loaded by
  `dynamic-plugin-framework` via `import()` - proven end to end in this
  repo's tests via a real `LocalFolderPluginRepository`, not just
  type-checking.

## Bundled Bun Module Usage

Loaded as a [dynamic-plugin-framework](https://github.com/flowscripter/dynamic-plugin-framework)
plugin - see that project's docs for how a host application discovers and
instantiates plugins. Direct usage of the bundle:

```typescript
import filesystemPlugin, {
  filesystemIOProviderFactory,
} from "https://unpkg.com/@flowscripter/io-plugin-filesystem/dist/bundle.js";

const provider = await filesystemIOProviderFactory.createProvider({ rootPath: "/data" });
```

## Development

Install dependencies:

`bun install`

Test:

`bun test`

Bundle for usage as a
[dynamic-plugin-framework](https://github.com/flowscripter/dynamic-plugin-framework)
plugin:

`bun run build`

Format:

`bunx oxfmt`

Lint:

`bunx oxlint index.ts src/ tests/`

Generate HTML API Documentation:

`bunx typedoc index.ts`

## Documentation

### Overview

Refer to
[pluggable-io-framework-api](https://github.com/flowscripter/pluggable-io-framework-api)
and
[pluggable-io-framework](https://github.com/flowscripter/pluggable-io-framework)
for the contract and orchestration this plugin implements.

### API

Link to auto-generated API docs:

[API Documentation](https://flowscripter.github.io/io-plugin-filesystem/index.html)

## License

MIT © Flowscripter
