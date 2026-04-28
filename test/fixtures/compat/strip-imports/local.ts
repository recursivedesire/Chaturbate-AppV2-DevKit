function localFeature() {
  (globalThis as any).__STRIP_LOCAL__ = true;
}

export { localFeature };
