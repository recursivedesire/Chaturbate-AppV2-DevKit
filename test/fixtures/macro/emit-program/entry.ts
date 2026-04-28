import { EMIT } from '@lib/macro';

EMIT(() => [
  'function AlphaFn(){ return 2; }',
  'function BetaFn(){ return 3; }',
  '(globalThis).__EMIT_PROGRAM__ = AlphaFn() + BetaFn();',
]);
