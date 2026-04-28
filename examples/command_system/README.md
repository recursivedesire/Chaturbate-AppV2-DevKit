# Command System Examples

These examples follow one evolving **Limitcam Manager** CLI from basic usage to compile-time setup.

## Files

- `01_builder_basics.ts`
  - basic `/lc status` command and runtime status output
- `02_args_and_options.ts`
  - start/stop/add/remove flow with `--k=v`, repeated options, and variadic args
- `03_permissions_visibility.ts`
  - owner-only commands, viewer-visible commands, help/list visibility behavior
- `04_analysis_execute_analysis.ts`
  - parse/validate/analyze first, execute later using `executeAnalysis`
- `05_typed_factories.ts`
  - typed argument/option constraints (`username`, `preset`, `duration`, repeatable allow-list)
- `06_compile_time_value_intermediate.ts`
  - compile-time policy object via `VALUE`, consumed by runtime-only command engine
- `07_compat_inlining_limitations.ts`
  - compat/inlining demonstration with local modules and side-effect import

## Compile-time VALUE intent

`06_compile_time_value_intermediate.ts` keeps verbose policy scaffolding inside `VALUE(() => ...)` so compile-only builder logic is removed from final runtime code.

The examples validator asserts:

- transformed code is smaller than source for this case
- compile-only scaffolding identifiers are absent after macro transform

## Compat limitation note

`07_compat_inlining_limitations.ts` demonstrates supported static patterns. Unsupported patterns are documented in comments and intentionally not executed.
