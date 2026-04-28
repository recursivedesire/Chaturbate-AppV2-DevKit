function VALUE_loop(value: number): number {
  return VALUE_loop(value + 1);
}

const output = VALUE_loop(0);
(globalThis as any).__VALUE_RECURSION_DIRECT__ = output;
