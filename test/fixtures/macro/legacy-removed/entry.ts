function MACRO_old() {
  return 9;
}

const value = MACRO_old();
(globalThis as any).__LEGACY_REMOVED__ = value;
