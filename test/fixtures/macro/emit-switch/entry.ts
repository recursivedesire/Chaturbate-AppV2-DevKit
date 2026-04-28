import { EMIT } from '@lib/macro';

switch (1) {
  case 1:
    EMIT(() => `(globalThis as any).__EMIT_SWITCH__ = ${JSON.stringify('ok')};`);
    break;
  default:
    (globalThis as any).__EMIT_SWITCH__ = 'bad';
}
