function fromExtless() {
  (globalThis as any).__FROM_EXTLESS__ = true;
}

export { fromExtless };
