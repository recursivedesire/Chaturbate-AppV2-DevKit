function MACRO_num() {
  return 7;
}

function run() {
  (globalThis as any).__INT_A__ = MACRO_num();
}

export { run };
