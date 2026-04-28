# Chaturbate AppV2 DevKit

A local TypeScript workflow for building Chaturbate App v2 apps while staying close to the official web editor runtime model.

## What This Is

- The real runtime is still the official App v2 web editor (JavaScript tabs + runtime-provided globals).
- This DevKit mirrors that model locally so you can write TypeScript, test, and compile before pasting output into DevPortal.
- `src/*.ts` mirrors web editor tabs.
- `src/api/*.ts` mirrors runtime globals/payloads as typed declarations.

Official API docs: <https://devportal.cb.dev/wiki/introduction>

## Quick Workflow

```bash
pnpm install
pnpm test
pnpm build
```

Then:

1. Open `dist/`.
2. Copy each generated event file into the matching DevPortal tab.
3. Copy `dist/shared_code.js` into Shared Code.

Notes:

- Empty outputs are removed on purpose (`find dist/ -type f -empty -delete` in build script).
- If an event file is missing in `dist/`, that source compiled to no runtime code.

## Why Build Is Needed

DevPortal App v2 runs in a constrained JS runtime (not a normal module runtime).
The build process converts local module-style TypeScript into deployment-safe JS:

- runtime compatibility normalization/inlining (`devportal-compat-plugin`, required)
- optional compile-time expansion (`macro-plugin`) for cleaner source and smaller output in some patterns
- ES target alignment via Babel config

This is why imports/exports can look normal in `src/`, but output in `dist/` is flattened/normalized for runtime execution.

## Minified Libs (Optional, Risk-Aware)

Default build path is non-minified app output (`pnpm build`).
Minified lib cache use is opt-in (`pnpm build:min`) and may be interpreted as obfuscation by platform terms.

Use only if you accept that risk.

Verification help:

- [DEVKIT_LIB_HASHES.md](./DEVKIT_LIB_HASHES.md) lists minified lib MD5 hashes and canonical DevKit source paths.
- Minified-injected comments include lib name, version, hash, and `src/libs/...` source path.

## Documentation

Canonical docs live in the GitHub wiki:

- <https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki>
- Quickstart: <https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Quickstart>
- Web Editor Parity: <https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Web-Editor-Parity>
- Official API vs DevKit: <https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Official-API-vs-DevKit>
- Project Structure and Flow: <https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Project-Structure-and-Flow>
- Build Transforms: <https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Build-Transforms>
- Testing and Validation: <https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Testing-and-Validation>

## License

MIT. See `LICENSE`.
