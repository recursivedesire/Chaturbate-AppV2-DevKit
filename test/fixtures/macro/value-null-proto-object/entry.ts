import { VALUE } from '@lib/macro';

const output = VALUE(() => {
  const root = Object.create(null) as Record<string, unknown>;
  root.title = 'zero-proto';
  root.values = [1, 2, 3];
  root.nested = {
    ok: true,
  };
  return root;
});

(globalThis as any).__VALUE_NULL_PROTO__ = output;
