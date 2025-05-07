# Changelog

## [0.57.0 - 0.73.0]

No changes necessary, these versions don't introduce any API changes, only act as either notices or fix bugs.

## [0.55.0] - 2025-05-07

Update the Chaturbate-AppV2-DevKit to match the v0.55.0 API
- Added `$room.ownerGender`
- Removed the Broadcast Panel Web Components definitions
- Added Broadcast Overlay definition

Updated all dependencies to their latest versions.

## [0.52.0] - 2024-05-06

Initial release of the Chaturbate-AppV2-DevKit matching the v0.52.0 API.
- Added TypeScript support with custom Babel plugins for Chaturbate App v2.
- Introduced local TypeScript definitions for the Chaturbate App v2 API.
- Implemented AVA- and proxyquire-powered unit testing framework.
- Added custom libraries for Chaturbate App v2:
    - A Command System Command System library that offers a modular approach to command management, parsing, and execution.
    - A Data Processor library that provides Base64 encoding and decoding, DJB2 hashing and a custom authentification algorithm.
    - A Wrapper Library around the $kv Storage API that provides namespaces, lists and maps.
    - A Template Engine library that allows dynamic string rendering.