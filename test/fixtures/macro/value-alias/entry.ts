import { VALUE as V } from '@lib/macro';

const output = V(() => 6 * 7);
(globalThis as any).__VALUE_ALIAS__ = output;
