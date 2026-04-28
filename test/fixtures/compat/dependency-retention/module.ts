function helper() {
  return 7;
}

function run() {
  (globalThis as any).__DEP_RETENTION__ = helper();
}

export { run };
