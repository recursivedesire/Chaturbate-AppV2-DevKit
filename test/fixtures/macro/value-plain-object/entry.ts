import { VALUE } from '@lib/macro';

const output = VALUE(() => ({
  user: {
    name: 'Ada',
    labels: ['admin', 'ops'],
  },
  flags: [true, false, true],
  meta: {
    retries: 2,
  },
}));

(globalThis as any).__VALUE_PLAIN_OBJECT__ = output;
