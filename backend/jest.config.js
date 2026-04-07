export default {
  testEnvironment: 'node',
  transform: {
    '\\.ts$': './jest-ts-transform.cjs',
  },
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['./tests/setup.ts'],
  testMatch: ['**/tests/**/*.test.ts'],
  forceExit: true,
  detectOpenHandles: true,
  resolver: './jest-resolver.cjs',
};
