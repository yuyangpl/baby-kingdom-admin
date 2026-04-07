// Frontend test setup
// Mock localStorage
const storage: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string): string | null => storage[key] ?? null,
  setItem: (key: string, value: string): void => { storage[key] = String(value); },
  removeItem: (key: string): void => { delete storage[key]; },
  clear: (): void => { Object.keys(storage).forEach(k => delete storage[k]); },
  length: 0,
  key: (_index: number): string | null => null,
};
