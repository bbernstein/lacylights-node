# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the LacyLights Node.js backend.

## Workflows

### 1. `ci.yml` - Comprehensive CI Pipeline
**Triggers:** Pull requests and pushes to `main`/`develop`
**Purpose:** Full integration testing with multiple Node.js versions

**Jobs:**
- **lint-and-build**: Runs on Node.js 18.x and 20.x
  - ESLint code quality checks
  - TypeScript compilation 
  - Full test suite with PostgreSQL/Redis
  - Coverage reporting
- **security-audit**: Security and dependency auditing
- **docker-build**: Docker image build verification

### 2. `pr-validation.yml` - Pull Request Validation
**Triggers:** PR events (opened, synchronize, reopened)
**Purpose:** Fast feedback on PR quality

**Features:**
- Pre-commit hook validation
- Breaking change detection
- Commit message validation
- Large file detection
- PR summary generation

### 3. `status-checks.yml` - Required Status Checks
**Triggers:** Pull requests and pushes to `main`/`develop`
**Purpose:** Minimal required checks for branch protection

**Jobs:**
- **lint**: ESLint validation
- **type-check**: TypeScript compilation
- **test**: Full test suite
- **all-checks**: Combined status for branch protection

## Branch Protection Setup

To use these workflows with branch protection rules:

1. Go to Repository Settings → Branches
2. Add rule for `main` branch
3. Enable "Require status checks to pass before merging"
4. Select these required checks:
   - `Lint`
   - `Type Check` 
   - `Test`
   - `All Checks Passed`

## Environment Variables

The workflows use these environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string  
- `NODE_ENV`: Set to `test` for testing
- `ARTNET_ENABLED`: Set to `false` for CI testing

## Test Database

The workflows automatically set up:
- PostgreSQL 15 with test database
- Redis 7 for caching/sessions
- Proper health checks and connection waiting
- Database migrations and Prisma client generation

## Coverage Reporting

The main CI workflow uploads coverage to Codecov when:
- Running on Node.js 20.x (latest)
- Tests generate coverage reports
- `codecov/codecov-action` is configured

## Performance

- **Fast feedback**: `pr-validation.yml` runs quickly for immediate PR feedback
- **Comprehensive testing**: `ci.yml` provides thorough validation
- **Parallel execution**: Jobs run concurrently where possible
- **Caching**: npm dependencies are cached for faster builds