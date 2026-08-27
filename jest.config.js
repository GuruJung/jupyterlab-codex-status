module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/test_ts'],
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@jupyterlab/ui-components$': '<rootDir>/test_ts/ui-components.mock.ts'
  },
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'test_ts/tsconfig.json' }] }
};
