# DevKit Examples

This folder contains progressive, runnable TypeScript examples for each library:

- `command_system` (Limitcam manager flow)
- `storage_kv` (goals/highscores/reminders state)
- `template_engine` (welcome/notice rendering)
- `macro` (compile-time VALUE/EMIT utilities)
- `data_processing` (minimal base64/hash utilities)

## Quick Start

Run example validation:

```bash
pnpm test:examples
```

This validates:

- each example compiles with the project Babel pipeline (`macro-plugin` + `devportal-compat-plugin`)
- runtime-safe examples execute in a controlled VM context with invariant checks
- compile-time `command_system` VALUE reduction behavior

## Notes

- Examples are educational and are not imported by production `src/` entrypoints.
- Naming is `snake_case` to match repository conventions.
- Macro wrappers must be imported from `@lib/macro` for compile-time transforms.
- Example outputs are published via local `publish_example.ts` helpers for deterministic `test:examples` checks.
