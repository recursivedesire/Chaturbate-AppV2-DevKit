import { VALUE } from '@lib/macro';

const output = VALUE(() => {
  const value: unknown[] = [1, 2];
  value.push(value);
  return value;
});

(globalThis as any).__VALUE_CYCLE_ARRAY__ = output;
