function publishExample(key: string, value: unknown): void {
  (globalThis as Record<string, unknown>)[key] = value;
}

export {publishExample};
