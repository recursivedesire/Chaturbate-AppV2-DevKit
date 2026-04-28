import { VALUE } from '@lib/macro';

const output = VALUE(() => Math.max);
(globalThis as any).__VALUE_NON_SOURCE_BACKED__ = output;
