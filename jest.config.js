module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom', // Use jsdom for File, FileReader etc.
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }]
  },
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  moduleNameMapper: {
    // If you have module aliases in tsconfig.paths, map them here
    // e.g., "^@components/(.*)$": "<rootDir>/src/components/$1"
  },
  // Ignore PostCSS/CSS files during tests if they cause issues,
  // though for ynabFormatter.ts tests, this is likely not needed.
  // moduleNameMapper: {
  //   '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  // },
};
