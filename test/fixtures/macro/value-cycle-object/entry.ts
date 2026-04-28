import { VALUE } from '@lib/macro';

const output = VALUE(() => {
  const value: Record<string, unknown> = {name: 'loop'};
  value.self = value;
  return value;
});

(globalThis as any).__VALUE_CYCLE_OBJECT__ = output;
