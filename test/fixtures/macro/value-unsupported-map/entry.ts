import { VALUE } from '@lib/macro';

const output = VALUE(() => {
  const map = new Map<string, number>();
  map.set('a', 1);
  return map;
});

(globalThis as any).__VALUE_UNSUPPORTED_MAP__ = output;
