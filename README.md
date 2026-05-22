# Chaturbate AppV2 DevKit

A local TypeScript workflow for building Chaturbate App v2 apps while staying close to the official web editor runtime model.

## What This Is

- The real runtime is still the official App v2 web editor (JavaScript tabs + runtime-provided globals).
- This DevKit mirrors that model locally so you can write TypeScript, test, and compile before pasting output into DevPortal.
- `src/events/*.ts` mirrors web editor event tabs.
- `src/broadcast_overlay/*` supports multiple named broadcast overlays (`.ts` + `.html` pairs).
- `src/shortcut/*` supports multiple named shortcuts.
- `src/api/*.ts` mirrors runtime globals/payloads as typed declarations.
- `src/libs/*` provides reusable DevKit helper libraries.

Official API docs: <https://devportal.cb.dev/wiki/introduction>

## Quick Workflow

```bash
pnpm install
pnpm test
pnpm build
```

Then:

1. Open `dist/events/` — copy each generated event file into the matching DevPortal tab.
2. Copy `dist/events/shared_code.js` into Shared Code.
3. Open `dist/broadcast_overlay/` — copy `shared_code.js` into the overlay Shared Code slot, and overlay JS/HTML pairs into individual overlay slots.
4. Open `dist/shortcut/` — copy shortcut files into DevPortal shortcut slots.

Notes:

- Empty outputs are removed on purpose (`find dist/ -type f -empty -delete` in build script).
- If an event file is missing in `dist/events/`, that source compiled to no runtime code.
- `template.*` files are copy-and-rename starters; they are not deployed.
- Overlay entries require both a `.ts` and `.html` file with the same basename.

## Source Layout

```
src/
  api/                          Typed declarations for runtime globals
  events/                       App event tab files (one per DevPortal event)
    shared_code.ts              App shared code
    app_start.ts
    callback.ts
    chat_message.ts
    ...
  broadcast_overlay/            Broadcast overlay entries
    shared_code.ts              Overlay shared code
    template.ts                 Starter — copy and rename
    template.html               Starter — copy and rename
    my_overlay.ts               Real overlay TS
    my_overlay.html             Real overlay HTML (same basename)
  shortcut/                     Shortcut entries
    template.ts                 Starter — copy and rename
    reset_goal.ts               Real shortcut entry
  libs/                         DevKit helper libraries
```

## Why Build Is Needed

DevPortal App v2 runs in a constrained JS runtime (not a normal module runtime).
The build process converts local module-style TypeScript into deployment-safe JS:

- runtime compatibility normalization/inlining (`devportal-compat-plugin`, required)
- optional compile-time expansion (`macro-plugin`) for cleaner source and smaller output in some patterns
- ES target alignment via Babel config

This is why imports/exports can look normal in `src/`, but output in `dist/` is flattened/normalized for runtime execution.

## Build Output

```
dist/
  events/                       Compiled event tabs
    shared_code.js
    app_start.js
    callback.js
    ...
  broadcast_overlay/            Compiled overlay entries
    shared_code.js
    my_overlay.js
    my_overlay.html
  shortcut/                     Compiled shortcuts
    reset_goal.js
  libs/                         Compiled helper libs (via pnpm libs)
```

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
