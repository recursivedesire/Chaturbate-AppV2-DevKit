# Macro Wrapper Examples

Examples for `@lib/macro` wrappers in room-management style workflows.

## Files

- `01_value_basics.ts`
  - `VALUE(() => ...)` static replacement for threshold/label constants
- `02_value_alias_and_static_import.ts`
  - alias import + static imported values inside VALUE
- `03_emit_basics.ts`
  - `EMIT(() => string[])` statement expansion for compiled runtime objects
- `04_valid_invalid_contexts.ts`
  - valid wrapper usage with explicit invalid-context notes

## Context Notes

- `VALUE` is expression-safe.
- `EMIT` must be a standalone expression statement.
- Invalid examples are documented in comments (not executed in passing examples).
