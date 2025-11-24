# LacyLights Node - Release Process

This document describes the release workflow for the LacyLights Node.js server, including beta releases, stable releases, and distribution management.

## Table of Contents

- [Overview](#overview)
- [Version Format](#version-format)
- [Beta Releases](#beta-releases)
- [Stable Releases](#stable-releases)
- [Release Checklist](#release-checklist)
- [Distribution Channels](#distribution-channels)
- [Troubleshooting](#troubleshooting)

## Overview

LacyLights Node uses an automated release workflow that:

- Creates GitHub releases with automatic release notes
- Builds and packages the application as npm-compatible tarballs
- Distributes releases via S3 (dist.lacylights.com)
- Tracks versions in DynamoDB for API access
- Supports both stable and beta (prerelease) versions

All releases are created through GitHub Actions and require no manual intervention beyond triggering the workflow.

## Version Format

LacyLights Node follows a modified semantic versioning scheme:

- **Stable releases**: `X.Y.Z` (e.g., `1.6.2`)
  - `X` = Major version (breaking changes)
  - `Y` = Minor version (new features, backward compatible)
  - `Z` = Patch version (bug fixes, backward compatible)

- **Beta releases**: `X.Y.Zb[N]` (e.g., `1.6.3b1`, `1.6.3b2`)
  - `[N]` = Beta number (auto-incremented for each beta)
  - Beta versions are marked as prereleases on GitHub
  - Beta versions are NOT included in `latest.json` (stable channel only)

## Beta Releases

### When to Use Beta Releases

Use beta releases when you want to:

- Test new features with early adopters
- Validate changes before stable release
- Get feedback on breaking changes
- Preview upcoming releases
- Test Raspberry Pi deployments without affecting stable users

### Creating Your First Beta

**Prerequisites:**
- Ensure all changes are committed to the main branch
- All tests must pass
- Code must be linted and properly formatted

**Steps:**

1. Navigate to **Actions** tab in GitHub repository
2. Select **"Create Release"** workflow
3. Click **"Run workflow"** button
4. Configure the workflow:
   - **Branch**: `main` (or your release branch)
   - **Version bump type**: Choose `patch`, `minor`, or `major`
   - **Create prerelease**: Check the box ✓
   - **Release name**: (optional) Leave blank for auto-generated name
5. Click **"Run workflow"**

**What happens:**

If your current version is `1.6.2` and you select `patch`:
- New version becomes `1.6.3b1`
- GitHub release is created and marked as "Pre-release"
- Tarball is uploaded to S3 at: `https://dist.lacylights.com/releases/node/lacylights-node-1.6.3b1.tar.gz`
- Version is recorded in DynamoDB with `isPrerelease: true`
- **Note**: `latest.json` is NOT updated (stable users are unaffected)

### Creating Additional Beta Versions

**Auto-incrementing behavior:** When you create a beta from an existing beta, the beta number automatically increments.

**Example progression:**
```
1.6.2 (stable) → 1.6.3b1 (first beta)
1.6.3b1 → 1.6.3b2 (next beta)
1.6.3b2 → 1.6.3b3 (next beta)
```

**Steps:**

1. Navigate to **Actions** > **"Create Release"**
2. Click **"Run workflow"**
3. Configure:
   - **Version bump type**: `patch` (ignored for beta-to-beta)
   - **Create prerelease**: Check the box ✓
4. Click **"Run workflow"**

The workflow automatically detects you're on a beta and increments the beta number.

### Beta to Stable (Finalizing a Release)

When you're ready to promote a beta to stable:

1. Navigate to **Actions** > **"Create Release"**
2. Click **"Run workflow"**
3. Configure:
   - **Version bump type**: `patch` (ignored for beta finalization)
   - **Create prerelease**: UNCHECK the box ✗
4. Click **"Run workflow"**

**What happens:**

If your current version is `1.6.3b2`:
- New version becomes `1.6.3` (beta suffix removed)
- GitHub release is created as a stable release
- `latest.json` is updated (stable users get the update)
- Tarball is uploaded to S3
- Version is recorded in DynamoDB with `isPrerelease: false`

## Stable Releases

### Creating a Stable Release

**Prerequisites:**
- All changes committed to main branch
- All tests passing
- Code properly linted and formatted
- No active beta in progress (or you intend to skip it)

**Steps:**

1. Navigate to **Actions** > **"Create Release"**
2. Click **"Run workflow"**
3. Configure:
   - **Version bump type**: Choose the appropriate bump:
     - `patch` - Bug fixes only (1.6.2 → 1.6.3)
     - `minor` - New features (1.6.2 → 1.7.0)
     - `major` - Breaking changes (1.6.2 → 2.0.0)
   - **Create prerelease**: UNCHECK the box ✗
4. Click **"Run workflow"**

**What happens:**

- Version is bumped according to semver rules
- GitHub release is created with auto-generated release notes
- Tarball is built and uploaded to S3
- `latest.json` is updated for stable channel
- Version is recorded in DynamoDB

### Bypassing Beta (Direct Stable Release)

You can skip the beta phase and go directly from one stable version to another:

```
1.6.2 (stable) → 1.6.3 (stable)
```

Simply create a release with **Create prerelease** unchecked.

## Release Checklist

### Pre-Release Validation

Before triggering a release, verify:

- [ ] All CI status checks are passing
- [ ] All unit tests pass locally: `npm test`
- [ ] Integration tests pass: `npm run test:integration`
- [ ] Code coverage meets requirements (75%+): `npm run test:coverage`
- [ ] No lint errors: `npm run lint`
- [ ] TypeScript compiles without errors: `npm run type-check`
- [ ] Database migrations are up to date: `npm run db:generate`
- [ ] CHANGELOG or release notes are prepared (if not using auto-generated)
- [ ] Version bump type is correct (patch/minor/major)
- [ ] Decision made: beta or stable release

### Post-Release Verification

After the release workflow completes:

#### 1. Verify GitHub Release

- [ ] Release appears at: `https://github.com/bbernstein/lacylights-node/releases`
- [ ] Release has correct version tag (e.g., `v1.6.3b1`)
- [ ] Release is marked as "Pre-release" if beta, or stable otherwise
- [ ] Tarball asset is attached to the release
- [ ] Auto-generated release notes look correct

#### 2. Verify S3 Distribution

- [ ] Tarball is downloadable from:
  ```
  https://dist.lacylights.com/releases/node/lacylights-node-<version>.tar.gz
  ```
- [ ] SHA256 checksum matches (shown in GitHub Actions summary)
- [ ] File size is reasonable (~15-30 MB typically)

#### 3. Verify latest.json (Stable Releases Only)

For stable releases, check:

- [ ] `latest.json` is updated:
  ```bash
  curl https://dist.lacylights.com/releases/node/latest.json
  ```
- [ ] JSON contains correct version, URL, SHA256, and `isPrerelease: false`

**Note**: Beta releases do NOT update `latest.json`.

#### 4. Verify DynamoDB Entry

While you typically won't access DynamoDB directly, the workflow logs should confirm:

- [ ] DynamoDB entry created successfully
- [ ] Component, version, and metadata are correct

#### 5. Functional Testing

For beta releases:

- [ ] Install the beta on a test Raspberry Pi:
  ```bash
  sudo /opt/lacylights/update.sh --beta
  ```
- [ ] Verify application starts correctly
- [ ] Test key functionality (DMX output, scene playback, etc.)
- [ ] Check logs for errors: `sudo journalctl -u lacylights -f`

For stable releases:

- [ ] Install the stable release on a test system:
  ```bash
  sudo /opt/lacylights/update.sh
  ```
- [ ] Run smoke tests to verify core functionality
- [ ] Monitor for any unexpected errors

### Release Communication

After successful verification:

- [ ] Update project documentation if needed
- [ ] Notify beta testers (for beta releases)
- [ ] Announce stable release (for stable releases)
- [ ] Update any installation guides with new version numbers

## Distribution Channels

### S3 Storage (dist.lacylights.com)

All releases are stored in S3:

**Stable releases:**
```
https://dist.lacylights.com/releases/node/lacylights-node-1.6.3.tar.gz
```

**Beta releases:**
```
https://dist.lacylights.com/releases/node/lacylights-node-1.6.3b1.tar.gz
```

**Latest stable version metadata:**
```
https://dist.lacylights.com/releases/node/latest.json
```

Example `latest.json`:
```json
{
  "version": "1.6.3",
  "url": "https://dist.lacylights.com/releases/node/lacylights-node-1.6.3.tar.gz",
  "sha256": "abc123...",
  "releaseDate": "2025-11-24T12:00:00Z",
  "isPrerelease": false,
  "fileSize": 25641984
}
```

### DynamoDB Version Registry

All versions (stable and beta) are stored in DynamoDB table for programmatic access:

**Table name**: `lacylights-releases` (default)

**Schema:**
```
component: "node"
version: "1.6.3b1"
url: "https://dist.lacylights.com/releases/node/lacylights-node-1.6.3b1.tar.gz"
sha256: "abc123..."
releaseDate: "2025-11-24T12:00:00Z"
isPrerelease: true
fileSize: 25641984
```

### Installation Methods

**Stable channel (default):**
```bash
sudo /opt/lacylights/update.sh
```

**Beta channel:**
```bash
sudo /opt/lacylights/update.sh --beta
```

**Specific version:**
```bash
sudo /opt/lacylights/update.sh --version 1.6.3b1
```

## Troubleshooting

### Common Issues

#### Release Workflow Fails at "Create GitHub Release"

**Symptom**: Release already exists error

**Cause**: Git tag exists but release creation failed

**Solution**:
1. Delete the tag locally and remotely:
   ```bash
   git tag -d v1.6.3b1
   git push origin :refs/tags/v1.6.3b1
   ```
2. Re-run the workflow

#### S3 Upload Fails

**Symptom**: AWS authentication or permission error

**Cause**: Invalid AWS credentials or insufficient permissions

**Solution**:
1. Verify GitHub secrets are configured:
   - `AWS_DIST_ACCESS_KEY_ID`
   - `AWS_DIST_SECRET_ACCESS_KEY`
   - `AWS_DIST_REGION`
   - `AWS_DIST_BUCKET`
2. Check IAM permissions for S3 PutObject
3. Re-run the workflow

#### Wrong Version Calculated

**Symptom**: Workflow creates unexpected version number

**Cause**: Current version detection or bump logic issue

**Solution**:
1. Check `package.json` contains valid version
2. Verify version format matches expected pattern
3. Review workflow logs for version calculation steps
4. If version is already tagged, you may need to bump package.json manually:
   ```bash
   npm version 1.6.3 --no-git-tag-version
   git commit -am "fix: correct version to 1.6.3"
   git push
   ```

#### latest.json Not Updated

**Symptom**: Stable release created but latest.json still shows old version

**Cause**: Workflow skips latest.json update for prereleases

**Solution**:
1. Verify the release is not marked as prerelease
2. Check workflow logs for "Update latest.json" step
3. If step was skipped, version may contain beta suffix
4. Manually verify version format:
   ```bash
   node -p "require('./package.json').version"
   ```

### Rollback Procedures

#### Rolling Back a Stable Release

If a stable release has critical issues:

1. **Immediate mitigation**: Update `latest.json` to previous stable version:
   ```bash
   # Manually upload previous version's latest.json to S3
   aws s3 cp previous-latest.json s3://your-bucket/releases/node/latest.json
   ```

2. **Create hotfix release**:
   - Fix the issue in code
   - Create a new patch release (e.g., 1.6.4)
   - Verify the fix
   - Release as stable

3. **DO NOT delete releases**: Keep failed releases available for debugging

#### Rolling Back a Beta Release

Beta releases don't affect stable users, so:

1. Fix the issue in code
2. Create a new beta (auto-increments: `b2`, `b3`, etc.)
3. Notify beta testers of the new version
4. Test the new beta thoroughly

#### Emergency: Delete a Release

Only in extreme cases (security issue, legal requirement):

1. Delete the GitHub release:
   ```bash
   gh release delete v1.6.3b1 --yes
   ```

2. Delete the S3 artifact:
   ```bash
   aws s3 rm s3://your-bucket/releases/node/lacylights-node-1.6.3b1.tar.gz
   ```

3. Delete the DynamoDB entry:
   ```bash
   aws dynamodb delete-item \
     --table-name lacylights-releases \
     --key '{"component": {"S": "node"}, "version": {"S": "1.6.3b1"}}'
   ```

4. If it was a stable release, update `latest.json` to previous version

### Getting Help

If you encounter issues not covered here:

1. Check GitHub Actions workflow logs for detailed error messages
2. Review recent commits for any configuration changes
3. Open an issue at: `https://github.com/bbernstein/lacylights-node/issues`
4. Include:
   - Workflow run URL
   - Error messages from logs
   - Current version and target version
   - Whether this is beta or stable release

## Best Practices

1. **Always test with beta first**: Use beta releases to validate changes before promoting to stable
2. **Keep beta cycles short**: Don't let betas linger; either fix and release or promote to stable
3. **Document breaking changes**: Use major version bumps and detailed release notes
4. **Monitor after release**: Watch for errors in production/field deployments
5. **Verify checksums**: Always verify SHA256 checksums match between GitHub and S3
6. **Communicate clearly**: Mark beta releases clearly and notify users of upgrade paths
