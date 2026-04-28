import './dep';

function MACRO_enabled() {
  return true;
}

function run() {
  if (MACRO_enabled()) {
    (globalThis as any).__INT_C__ = ((globalThis as any).__DEP__ ?? 0) + 2;
  }
}

export { run };
