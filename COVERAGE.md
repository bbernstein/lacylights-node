# Code Coverage Policy

## Current Coverage Thresholds

This repository maintains minimum code coverage thresholds to ensure code quality. The thresholds are configured in `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    branches: 69,
    functions: 84,
    lines: 84,
    statements: 83,
  },
}
```

**Current Coverage (as of 2025-10-24):**
- Statements: 83.92%
- Branches: 69.79%
- Functions: 84.39%
- Lines: 84.21%

## Continuous Improvement Strategy

### High-Water Mark Approach

We use a **high-water mark** strategy for code coverage:

1. **Current thresholds reflect actual coverage** - Thresholds are set slightly below current coverage to allow for minor variations
2. **Coverage should never decrease** - New code must maintain or improve coverage
3. **Periodic threshold increases** - When coverage improves significantly, update thresholds in `jest.config.js`

### Running Coverage Tests

```bash
# Run tests with coverage report
npm run test:coverage

# View coverage summary in terminal
npm run test:coverage:summary

# Open detailed HTML coverage report
open coverage/index.html
```

### CI/CD Enforcement

The GitHub Actions CI workflow (`ci.yml`) runs coverage tests on every pull request. **Builds will fail** if coverage drops below the configured thresholds.

## Improving Coverage

### Adding Tests for Uncovered Code

1. Run `npm run test:coverage` to generate a coverage report
2. Open `coverage/index.html` in a browser to see detailed coverage
3. Identify files with low coverage (shown in red/orange)
4. Add unit tests for uncovered lines, branches, and functions
5. Re-run coverage to verify improvement

### Updating Thresholds

When coverage improves across the codebase:

1. Run `npm run test:coverage` to get current metrics
2. Update thresholds in `jest.config.js` to reflect new baseline
3. Round down slightly to allow for minor variations
4. Commit the updated thresholds
5. Document the change in this file

### Best Practices

- **Test new features thoroughly** - Aim for 80%+ coverage on new code
- **Don't sacrifice quality for numbers** - Focus on meaningful tests
- **Test edge cases and error paths** - These often have low coverage
- **Use coverage as a guide** - 100% coverage doesn't guarantee bug-free code
- **Review coverage reports regularly** - Look for gaps in critical paths

## Coverage Gaps

Known areas with lower coverage that need improvement:

- `src/context.ts`: 36.92% lines (heavy server initialization logic)
- `src/main.ts`: 41.66% lines (entry point, hard to test)
- `src/graphql/resolvers/export.ts`: 20% lines (file export functionality)
- `src/graphql/resolvers/fixture.ts`: 15.58% lines (complex fixture management)

**Contributors:** When working in these files, please add tests to improve coverage!

## Resources

- [Jest Coverage Documentation](https://jestjs.io/docs/configuration#coveragethreshold-object)
- [Writing Testable Code](https://testing-library.com/docs/guiding-principles/)
- [Coverage Reports Location](./coverage/index.html)
