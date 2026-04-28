# Storage KV Examples

Examples for `@lib/storage_kv` using common app-state patterns.

## Files

- `01_core_kv.ts`
  - goal target/progress counters and fallback values
- `02_json_namespace_iterators.ts`
  - JSON score records, iterator scan, and namespace separation
- `03_list_flows.ts`
  - reminder queue list flows (`add/remove/defrag/iter`)
- `04_map_flows.ts`
  - session map flows (`set/get/remove/clear/iter`)
