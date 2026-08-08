/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          target: 'ES2022',
          lib: ['ES2022'],
          types: ['node', 'jest'],
          skipLibCheck: true
        }
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js', 'json']
}
