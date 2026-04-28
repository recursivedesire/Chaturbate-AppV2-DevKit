function VALUE_base() {
  return 2;
}

function VALUE_plusOne(value: number) {
  return value + 1;
}

const nestedValue = VALUE_plusOne(VALUE_base());
(globalThis as any).__VALUE_NESTED__ = nestedValue;
