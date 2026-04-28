function sideEffect() {
  (globalThis as any).__FULL_INLINE__ = 1;
}

sideEffect();
