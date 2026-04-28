function VALUE_left(value: number): number {
  return VALUE_right(value + 1);
}

function VALUE_right(value: number): number {
  return VALUE_left(value + 1);
}

const output = VALUE_left(0);
(globalThis as any).__VALUE_RECURSION_MUTUAL__ = output;
