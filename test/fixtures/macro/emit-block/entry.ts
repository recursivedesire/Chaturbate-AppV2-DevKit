import { EMIT } from '@lib/macro';

function run() {
  EMIT(() => 'function InnerValue(){ return 7; }');
  (globalThis as any).__EMIT_BLOCK__ = InnerValue();
}

run();
