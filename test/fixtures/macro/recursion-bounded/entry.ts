function VALUE_countdown(value: number): number {
  if (value <= 0) {
    return 0;
  }
  return 1 + VALUE_countdown(value - 1);
}

const output = VALUE_countdown(10);
(globalThis as any).__VALUE_RECURSION_BOUNDED__ = output;
