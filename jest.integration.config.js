module.exports = {
    preset: "ts-jest",
    testEnvironment: "<rootDir>/jest-environment-with-localstorage.js",
    roots: ["<rootDir>/src"],
    testMatch: [
        "**/__tests__/integration/**/*.integration.test.ts",
    ],
    testPathIgnorePatterns: [
        "/node_modules/",
    ],
    transform: {
        "^.+\\.ts$": ["ts-jest", {
            tsconfig: {
                strict: false,
                noImplicitAny: false,
                strictNullChecks: false,
            },
            isolatedModules: true,
        }],
    },
    setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
    testTimeout: 60000, // 60 seconds for integration tests
    verbose: true,
    forceExit: true,
    detectOpenHandles: false,
    clearMocks: true,
    restoreMocks: true,
    resetMocks: true,
    // Run integration tests sequentially to avoid database conflicts
    maxWorkers: 1,
};
