import { VALUE } from '@lib/macro';

const output = VALUE(() => new Date('2026-04-27T00:00:00.000Z'));
(globalThis as any).__VALUE_UNSUPPORTED_DATE__ = output;
