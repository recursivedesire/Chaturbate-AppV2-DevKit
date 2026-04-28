import { EMIT } from '@lib/macro';

const x = EMIT(() => 'const value = 1;');
(globalThis as any).__EMIT_INVALID_CONTEXT__ = x;
