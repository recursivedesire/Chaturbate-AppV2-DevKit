function fromTs() {
  (globalThis as any).__FROM_TS__ = true;
}

export { fromTs };
