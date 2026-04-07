export default {
  testEnvironment: 'node',
  transform: {
    '\\.ts$': './jest-ts-transform.cjs',
  },
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  forceExit: true,
  detectOpenHandles: true,
  resolver: './jest-resolver.cjs',
};
