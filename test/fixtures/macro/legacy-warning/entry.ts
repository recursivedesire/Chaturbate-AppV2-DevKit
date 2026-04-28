function MACRO_add(a: number, b: number) {
  return a + b;
}

const one = MACRO_add(1, 2);
const two = MACRO_add(3, 4);
(globalThis as any).__LEGACY_WARNING__ = one + two;
