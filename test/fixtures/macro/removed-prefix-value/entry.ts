function VALUE_old() {
  return 1;
}

const output = VALUE_old();
(globalThis as any).__REMOVED_PREFIX_VALUE__ = output;
