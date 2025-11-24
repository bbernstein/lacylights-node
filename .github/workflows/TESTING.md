# GitHub Actions Workflow Testing Guide

## Overview

This document provides comprehensive testing guidance for the `release.yml` GitHub Actions workflow, which implements automatic beta versioning for lacylights-node releases.

## Workflow Features

The workflow implements the following beta versioning logic:

1. **Stable → First Beta** (e.g., 1.6.2 → 1.7.0b1): Creates first beta with version bump
2. **Beta → Next Beta** (e.g., 1.7.0b1 → 1.7.0b2): Increments beta number, ignores version_bump input
3. **Beta → Stable** (e.g., 1.7.0b5 → 1.7.0): Finalizes release by removing beta suffix
4. **Stable → Stable** (e.g., 1.6.2 → 1.6.3): Standard version bump

## Test Scenarios

### Scenario 1: Stable → First Beta

**Initial State:**
- Current version: `1.6.2` (stable)
- Package.json version: `1.6.2`

**Test Cases:**

#### 1.1: Patch Beta
**Inputs:**
- version_bump: `patch`
- is_prerelease: `true`

**Expected Outcome:**
- New version: `1.6.3b1`
- Git tag: `v1.6.3b1`
- GitHub release marked as prerelease: `true`
- package.json updated to: `1.6.3b1`
- S3 artifact uploaded: `lacylights-node-1.6.3b1.tar.gz`
- DynamoDB entry created with `isPrerelease: true`
- latest.json **NOT** updated (prereleases don't update latest)

#### 1.2: Minor Beta
**Inputs:**
- version_bump: `minor`
- is_prerelease: `true`

**Expected Outcome:**
- New version: `1.7.0b1`
- Git tag: `v1.7.0b1`
- GitHub release marked as prerelease: `true`
- package.json updated to: `1.7.0b1`
- S3 artifact uploaded: `lacylights-node-1.7.0b1.tar.gz`
- DynamoDB entry created with `isPrerelease: true`
- latest.json **NOT** updated

#### 1.3: Major Beta
**Inputs:**
- version_bump: `major`
- is_prerelease: `true`

**Expected Outcome:**
- New version: `2.0.0b1`
- Git tag: `v2.0.0b1`
- GitHub release marked as prerelease: `true`
- package.json updated to: `2.0.0b1`
- S3 artifact uploaded: `lacylights-node-2.0.0b1.tar.gz`
- DynamoDB entry created with `isPrerelease: true`
- latest.json **NOT** updated

---

### Scenario 2: Beta → Next Beta

**Initial State:**
- Current version: `1.7.0b1` (beta)
- Package.json version: `1.7.0b1`

**Test Cases:**

#### 2.1: Increment Beta (Patch Selected)
**Inputs:**
- version_bump: `patch` *(ignored)*
- is_prerelease: `true`

**Expected Outcome:**
- New version: `1.7.0b2`
- Git tag: `v1.7.0b2`
- GitHub release marked as prerelease: `true`
- package.json updated to: `1.7.0b2`
- S3 artifact uploaded: `lacylights-node-1.7.0b2.tar.gz`
- DynamoDB entry created with `isPrerelease: true`
- latest.json **NOT** updated

**Note:** The `version_bump` input is **ignored** when going from Beta → Beta. Only the beta number increments.

#### 2.2: Multiple Beta Increments
**Initial State:** `1.7.0b5`

**Inputs:**
- version_bump: `minor` *(ignored)*
- is_prerelease: `true`

**Expected Outcome:**
- New version: `1.7.0b6`
- Git tag: `v1.7.0b6`
- GitHub release marked as prerelease: `true`

---

### Scenario 3: Beta → Stable (Finalization)

**Initial State:**
- Current version: `1.7.0b5` (beta)
- Package.json version: `1.7.0b5`

**Test Cases:**

#### 3.1: Finalize Beta Release
**Inputs:**
- version_bump: `patch` *(ignored)*
- is_prerelease: `false`

**Expected Outcome:**
- New version: `1.7.0` (beta suffix removed)
- Git tag: `v1.7.0`
- GitHub release marked as prerelease: `false`
- package.json updated to: `1.7.0`
- S3 artifact uploaded: `lacylights-node-1.7.0.tar.gz`
- DynamoDB entry created with `isPrerelease: false`
- latest.json **UPDATED** with stable release info

**Note:** The `version_bump` input is **ignored** when finalizing. The version is simply the base version without the beta suffix.

---

### Scenario 4: Stable → Stable

**Initial State:**
- Current version: `1.6.2` (stable)
- Package.json version: `1.6.2`

**Test Cases:**

#### 4.1: Patch Bump
**Inputs:**
- version_bump: `patch`
- is_prerelease: `false`

**Expected Outcome:**
- New version: `1.6.3`
- Git tag: `v1.6.3`
- GitHub release marked as prerelease: `false`
- package.json updated to: `1.6.3`
- S3 artifact uploaded: `lacylights-node-1.6.3.tar.gz`
- DynamoDB entry created with `isPrerelease: false`
- latest.json **UPDATED**

#### 4.2: Minor Bump
**Inputs:**
- version_bump: `minor`
- is_prerelease: `false`

**Expected Outcome:**
- New version: `1.7.0`
- Git tag: `v1.7.0`
- GitHub release marked as prerelease: `false`
- package.json updated to: `1.7.0`
- latest.json **UPDATED**

#### 4.3: Major Bump
**Inputs:**
- version_bump: `major`
- is_prerelease: `false`

**Expected Outcome:**
- New version: `2.0.0`
- Git tag: `v2.0.0`
- GitHub release marked as prerelease: `false`
- package.json updated to: `2.0.0`
- latest.json **UPDATED**

---

## Manual Testing Checklist

### Pre-Testing Setup

- [ ] Ensure `RELEASE_TOKEN` secret is configured in GitHub repository settings
- [ ] Verify AWS secrets are configured:
  - [ ] `AWS_DIST_ACCESS_KEY_ID`
  - [ ] `AWS_DIST_SECRET_ACCESS_KEY`
  - [ ] `AWS_DIST_REGION`
  - [ ] `AWS_DIST_BUCKET`
  - [ ] `AWS_DIST_TABLE_NAME` (optional, defaults to 'lacylights-releases')
- [ ] Confirm current branch state and version in package.json
- [ ] Create backup of current branch (optional but recommended)

### Test Execution

For each scenario above:

1. **Trigger Workflow**
   - Navigate to Actions → Create Release
   - Set appropriate inputs (version_bump, is_prerelease)
   - Click "Run workflow"

2. **Monitor Execution**
   - [ ] Check all workflow steps complete successfully
   - [ ] Review logs for version calculation output
   - [ ] Verify no error messages in workflow run

3. **Verify Outputs**
   - [ ] Check package.json version matches expected
   - [ ] Verify package-lock.json updated correctly
   - [ ] Confirm git tag created: `git tag | grep v{version}`
   - [ ] Check GitHub release exists at: `https://github.com/{owner}/{repo}/releases/tag/v{version}`
   - [ ] Verify prerelease flag matches expectation in GitHub UI
   - [ ] Confirm release notes auto-generated

4. **Verify Distribution**
   - [ ] Check S3 artifact uploaded: `lacylights-node-{version}.tar.gz`
   - [ ] Download artifact and verify contents (dist/, node_modules/, package.json, prisma/)
   - [ ] Verify SHA256 checksum matches calculated value
   - [ ] Confirm DynamoDB entry created with correct fields
   - [ ] For stable releases: verify latest.json updated at `https://dist.lacylights.com/releases/node/latest.json`
   - [ ] For prereleases: confirm latest.json **NOT** updated

5. **Verify Repository State**
   - [ ] Check commit exists: `git log --oneline -1`
   - [ ] Confirm commit message: `"chore: bump version to {version}"`
   - [ ] Verify commit pushed to remote
   - [ ] Check git tag pushed to remote

### Edge Cases to Test

#### EC-1: Workflow Re-run on Existing Release
**Setup:** Run workflow twice with same inputs

**Expected Outcome:**
- First run: Creates release successfully
- Second run: Detects existing release, skips creation step
- No errors thrown

#### EC-2: Invalid Current Version Format
**Setup:** Manually set package.json version to invalid format (e.g., "1.6.2-alpha")

**Expected Outcome:**
- Workflow may fail or produce unexpected results
- Document behavior for future improvement

#### EC-3: Large Beta Numbers
**Setup:** Start with version `1.7.0b99`, run Beta → Beta

**Expected Outcome:**
- New version: `1.7.0b100`
- No issues with 3-digit beta numbers

#### EC-4: Network Failures
**Setup:** Test with AWS credentials temporarily removed

**Expected Outcome:**
- Workflow fails gracefully at S3/DynamoDB step
- Clear error message in logs
- Git tags and commits already pushed (document rollback needed)

---

## Rollback Procedures

### Rollback Scenario 1: Workflow Failed After Version Bump Commit

**Situation:** Version committed to git but release failed (e.g., S3 upload error)

**Steps:**
1. Identify the commit that bumped the version: `git log --oneline -5`
2. Revert the version bump commit:
   ```bash
   git revert <commit-hash>
   git push origin main
   ```
3. Delete the git tag if created:
   ```bash
   git tag -d v{version}
   git push origin :refs/tags/v{version}
   ```
4. Delete GitHub release if created (via GitHub UI or `gh release delete`)
5. Fix underlying issue (e.g., AWS credentials)
6. Re-run workflow

### Rollback Scenario 2: Need to Undo Entire Release

**Situation:** Release completed but needs to be removed (e.g., critical bug found)

**Steps:**
1. Delete GitHub release:
   ```bash
   gh release delete v{version} --yes
   ```
2. Delete git tag:
   ```bash
   git tag -d v{version}
   git push origin :refs/tags/v{version}
   ```
3. Revert version bump commit:
   ```bash
   git revert <commit-hash>
   git push origin main
   ```
4. Remove S3 artifact:
   ```bash
   aws s3 rm s3://${BUCKET}/releases/node/lacylights-node-{version}.tar.gz
   ```
5. Remove DynamoDB entry:
   ```bash
   aws dynamodb delete-item \
     --table-name lacylights-releases \
     --key '{"component": {"S": "node"}, "version": {"S": "{version}"}}'
   ```
6. If stable release, restore previous latest.json (if backup exists)

### Rollback Scenario 3: Beta Version Needs Correction

**Situation:** Beta release (e.g., 1.7.0b2) has issues, need to release fixed b3

**Steps:**
1. Fix issues in code
2. Run workflow again with:
   - version_bump: `patch` (ignored)
   - is_prerelease: `true`
3. New version `1.7.0b3` created automatically
4. Optionally delete previous beta release from GitHub (keep or remove as needed)

---

## Validation Scripts

### Script 1: Validate Version Calculation Logic

Create a shell script to test version calculation locally:

```bash
#!/bin/bash
# test-version-logic.sh

test_version_calculation() {
  local CURRENT_VERSION=$1
  local VERSION_BUMP=$2
  local IS_PRERELEASE=$3
  local EXPECTED=$4

  echo "Testing: $CURRENT_VERSION + $VERSION_BUMP (prerelease=$IS_PRERELEASE)"

  # Detect if current version is a beta
  if [[ "$CURRENT_VERSION" =~ ^([0-9]+\.[0-9]+\.[0-9]+)b([0-9]+)$ ]]; then
    IS_CURRENT_BETA=true
    BASE_VERSION="${BASH_REMATCH[1]}"
    BETA_NUMBER="${BASH_REMATCH[2]}"
  else
    IS_CURRENT_BETA=false
    BASE_VERSION="$CURRENT_VERSION"
  fi

  # Parse base version
  IFS='.' read -ra VERSION_PARTS <<< "$BASE_VERSION"
  MAJOR="${VERSION_PARTS[0]}"
  MINOR="${VERSION_PARTS[1]}"
  PATCH="${VERSION_PARTS[2]}"

  # Decision logic
  if [ "$IS_PRERELEASE" = "true" ]; then
    if [ "$IS_CURRENT_BETA" = "true" ]; then
      BETA_NUMBER=$((BETA_NUMBER + 1))
      NEW_VERSION="${BASE_VERSION}b${BETA_NUMBER}"
    else
      case "$VERSION_BUMP" in
        major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
        minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
        patch) PATCH=$((PATCH + 1)) ;;
      esac
      NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}b1"
    fi
  else
    if [ "$IS_CURRENT_BETA" = "true" ]; then
      NEW_VERSION="$BASE_VERSION"
    else
      case "$VERSION_BUMP" in
        major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
        minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
        patch) PATCH=$((PATCH + 1)) ;;
      esac
      NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
    fi
  fi

  if [ "$NEW_VERSION" = "$EXPECTED" ]; then
    echo "✓ PASS: $NEW_VERSION"
  else
    echo "✗ FAIL: Expected $EXPECTED, got $NEW_VERSION"
  fi
  echo ""
}

# Run test cases
echo "=== Version Calculation Tests ==="
echo ""

# Stable → Beta
test_version_calculation "1.6.2" "patch" "true" "1.6.3b1"
test_version_calculation "1.6.2" "minor" "true" "1.7.0b1"
test_version_calculation "1.6.2" "major" "true" "2.0.0b1"

# Beta → Beta
test_version_calculation "1.7.0b1" "patch" "true" "1.7.0b2"
test_version_calculation "1.7.0b5" "minor" "true" "1.7.0b6"

# Beta → Stable
test_version_calculation "1.7.0b5" "patch" "false" "1.7.0"
test_version_calculation "2.0.0b3" "major" "false" "2.0.0"

# Stable → Stable
test_version_calculation "1.6.2" "patch" "false" "1.6.3"
test_version_calculation "1.6.2" "minor" "false" "1.7.0"
test_version_calculation "1.6.2" "major" "false" "2.0.0"

echo "=== All Tests Complete ==="
```

**Usage:**
```bash
chmod +x test-version-logic.sh
./test-version-logic.sh
```

### Script 2: Verify Release Artifact

```bash
#!/bin/bash
# verify-release.sh

VERSION=$1
ARTIFACT="lacylights-node-${VERSION}.tar.gz"
S3_URL="https://dist.lacylights.com/releases/node/${ARTIFACT}"

echo "Verifying release: $VERSION"
echo ""

# Check GitHub release
echo "Checking GitHub release..."
gh release view "v${VERSION}" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✓ GitHub release exists"
else
  echo "✗ GitHub release NOT found"
fi

# Check S3 artifact
echo "Checking S3 artifact..."
curl -I "${S3_URL}" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✓ S3 artifact exists"
else
  echo "✗ S3 artifact NOT found"
fi

# Check latest.json if stable
if [[ ! "$VERSION" =~ b[0-9]+$ ]]; then
  echo "Checking latest.json..."
  LATEST_VERSION=$(curl -s https://dist.lacylights.com/releases/node/latest.json | jq -r '.version')
  if [ "$LATEST_VERSION" = "$VERSION" ]; then
    echo "✓ latest.json updated"
  else
    echo "✗ latest.json shows: $LATEST_VERSION"
  fi
fi

echo ""
echo "Verification complete"
```

**Usage:**
```bash
chmod +x verify-release.sh
./verify-release.sh 1.7.0
```

---

## Common Issues and Solutions

### Issue 1: "npm version" Fails
**Symptom:** Workflow fails at "Update package.json version" step

**Possible Causes:**
- Dirty git working directory
- Invalid version format

**Solution:**
- Ensure all changes committed before running workflow
- Check package.json version format matches semver

### Issue 2: Git Push Fails
**Symptom:** "Permission denied" or "failed to push" error

**Possible Causes:**
- RELEASE_TOKEN missing or expired
- Branch protection rules blocking push

**Solution:**
- Verify RELEASE_TOKEN has `contents: write` permission
- Check branch protection settings allow bot commits

### Issue 3: S3 Upload Fails
**Symptom:** "Access Denied" or "No such bucket" error

**Possible Causes:**
- AWS credentials invalid
- Bucket doesn't exist
- IAM permissions insufficient

**Solution:**
- Verify all AWS secrets configured correctly
- Check IAM policy includes `s3:PutObject` permission
- Confirm bucket name matches secret

### Issue 4: DynamoDB Update Fails
**Symptom:** "Table not found" or "Access Denied"

**Possible Causes:**
- Table name incorrect
- IAM permissions insufficient
- Region mismatch

**Solution:**
- Verify AWS_DIST_TABLE_NAME matches actual table
- Check IAM policy includes `dynamodb:PutItem`
- Ensure AWS_DIST_REGION correct

### Issue 5: Prerelease Flag Incorrect
**Symptom:** Beta version not marked as prerelease in GitHub

**Possible Causes:**
- Version detection regex failed
- Step output not passed correctly

**Solution:**
- Check "Detect prerelease status" step logs
- Verify regex matches version format
- Ensure step outputs used correctly in subsequent steps

---

## Continuous Improvement

### Recommended Enhancements

1. **Automated Testing:**
   - Add act (GitHub Actions local runner) tests
   - Create integration test suite for version logic
   - Set up staging environment for end-to-end testing

2. **Monitoring:**
   - Add Slack/Discord notifications for release completion
   - Track release metrics (frequency, failure rate)
   - Monitor S3/DynamoDB for orphaned entries

3. **Documentation:**
   - Auto-generate changelog from commits
   - Include migration notes for breaking changes
   - Document API changes in release notes

4. **Safety:**
   - Add confirmation step for major version bumps
   - Implement release approval workflow
   - Add smoke tests after deployment

---

## Appendix: Version Format Specification

### Valid Version Formats

- **Stable:** `MAJOR.MINOR.PATCH` (e.g., `1.6.2`)
- **Beta:** `MAJOR.MINOR.PATCHbBETA` (e.g., `1.7.0b1`)

Where:
- `MAJOR`: Major version number (0-9999)
- `MINOR`: Minor version number (0-9999)
- `PATCH`: Patch version number (0-9999)
- `BETA`: Beta number (1-9999)

### Beta Detection Regex

```regex
^([0-9]+\.[0-9]+\.[0-9]+)b([0-9]+)$
```

**Capture Groups:**
- Group 1: Base version (e.g., `1.7.0`)
- Group 2: Beta number (e.g., `5`)

---

## Document Maintenance

**Last Updated:** 2025-11-24
**Author:** LacyLights Development Team
**Version:** 1.0

**Change Log:**
- 2025-11-24: Initial version created with comprehensive test scenarios and rollback procedures
