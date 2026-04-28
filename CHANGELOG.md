# Changelog

## [0.95.0] - 2026-04-28

No changes to the API introduced, but a major internal refactor and new features to the Chaturbate-AppV2-DevKit:
- Rewrote `devportal-compat-plugin` for more reliable inlining/resolution across common TypeScript module patterns.
- Added `build:min` flow with minified library substitution for smaller output builds.
- Upgraded `macro-plugin` to wrapper-first macros (`VALUE`, `EMIT`) with static-argument evaluation and legacy `MACRO_*` migration support.
- Replaced the legacy command system with the new easier to use builder/runtime/introspection architecture.
- Changed filenames in `src/` from camelCase to snake_case.
  - Example: `src/appStart.ts` -> `src/app_start.ts`
  - Example: `src/chatMessage.ts` -> `src/chat_message.ts`
- Moved tests into dedicated `test/` structure and expanded plugin coverage.
- Added `examples/` library portfolio, including compile-time command-system examples.

Updated all dependencies to their latest versions.

## [0.57.0 - 0.92.0] - 2025-05-07

No changes necessary, these versions don't introduce any API changes, only act as either notices or fix bugs.

## [0.55.0] - 2025-05-07

Update the Chaturbate-AppV2-DevKit to match the v0.55.0 API
- Added `$room.ownerGender`
- Removed the Broadcast Panel Web Components definitions
- Added Broadcast Overlay definition

Updated all dependencies to their latest versions.

## [0.52.0] - 2024-05-06

Initial release of the Chaturbate-AppV2-DevKit matching the v0.52.0 API.
- Added TypeScript support with custom Babel plugins for App v2.
- Introduced local TypeScript definitions for the App v2 API.
- Implemented AVA- and proxyquire-powered unit testing framework.
- Added custom libraries for App v2:
    - A Command System Command System library that offers a modular approach to command management, parsing, and execution.
    - A Data Processor library that provides Base64 encoding and decoding, DJB2 hashing and a custom authentification algorithm.
    - A Wrapper Library around the $kv Storage API that provides namespaces, lists and maps.
    - A Template Engine library that allows dynamic string rendering.
