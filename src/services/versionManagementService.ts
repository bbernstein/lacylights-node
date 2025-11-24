import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);

export interface RepositoryVersion {
  repository: string;
  installed: string;
  latest: string;
  updateAvailable: boolean;
}

export interface SystemVersionInfo {
  repositories: RepositoryVersion[];
  lastChecked: string;
  versionManagementSupported?: boolean;
}

export interface UpdateResult {
  success: boolean;
  repository: string;
  previousVersion: string;
  newVersion: string;
  message?: string;
  error?: string;
}

export class VersionManagementService {
  private static readonly VALID_REPOSITORIES = ['lacylights-fe', 'lacylights-node', 'lacylights-mcp'] as const;
  // Matches "latest" or full semver: v?MAJOR.MINOR.PATCH(bN)?(-PRERELEASE)?(+BUILD)?
  // Supports custom beta format (e.g., v1.6.4b1) and standard semver prerelease
  private static readonly VERSION_PATTERN = /^(latest|v?\d+\.\d+\.\d+(?:b[1-9][0-9]*)?(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?)$/;
  private static readonly UPDATE_TIMEOUT_MS = 300000; // 5 minutes

  private updateScriptPath: string;
  private wrapperScriptPath: string;
  private reposBasePath: string;
  private wrapperScriptAvailable?: boolean;

  constructor(
    updateScriptPath = '/opt/lacylights/scripts/update-repos.sh',
    reposBasePath = '/opt/lacylights/repos',
    wrapperScriptPath = '/opt/lacylights/scripts/update-repos-wrapper.sh'
  ) {
    this.updateScriptPath = updateScriptPath;
    this.wrapperScriptPath = wrapperScriptPath;
    this.reposBasePath = reposBasePath;
  }

  /**
   * Validate repository name against whitelist
   */
  private validateRepositoryName(repository: string): void {
    const validRepos: readonly string[] = VersionManagementService.VALID_REPOSITORIES;
    if (!validRepos.includes(repository)) {
      throw new Error(
        `Invalid repository name: ${repository}. Must be one of: ${VersionManagementService.VALID_REPOSITORIES.join(', ')}`
      );
    }
  }

  /**
   * Validate version string to prevent command injection
   */
  private validateVersion(version: string): void {
    if (!VersionManagementService.VERSION_PATTERN.test(version)) {
      throw new Error(
        `Invalid version format: ${version}. Must be 'latest' or a semantic version (e.g., '1.2.3', 'v1.2.3', '1.6.4b1')`
      );
    }
  }

  /**
   * Normalize version string by removing 'v' prefix for comparison
   */
  private normalizeVersion(version: string): string {
    return version.startsWith('v') ? version.substring(1) : version;
  }

  /**
   * Check if the update script exists and is executable
   */
  async isUpdateScriptAvailable(): Promise<boolean> {
    try {
      await fs.access(this.updateScriptPath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the best available update script (wrapper if available, base script otherwise)
   * The wrapper script handles read-only filesystem remounting on Raspberry Pi
   *
   * This method caches the wrapper availability check to avoid redundant filesystem
   * access on subsequent calls, improving performance when multiple operations are
   * performed in succession.
   */
  private async getUpdateScript(): Promise<string> {
    if (this.wrapperScriptAvailable === undefined) {
      try {
        await fs.access(this.wrapperScriptPath, fs.constants.X_OK);
        this.wrapperScriptAvailable = true;
      } catch {
        this.wrapperScriptAvailable = false;
      }
    }
    return this.wrapperScriptAvailable ? this.wrapperScriptPath : this.updateScriptPath;
  }

  /**
   * Get version information for all repositories
   */
  async getSystemVersions(): Promise<SystemVersionInfo> {
    if (!(await this.isUpdateScriptAvailable())) {
      throw new Error('Update script not available. Version management is not supported on this system.');
    }

    try {
      const scriptPath = await this.getUpdateScript();
      const { stdout } = await execFileAsync(scriptPath, ['versions', 'json']);
      const versionsData = JSON.parse(stdout);

      const repositories: RepositoryVersion[] = Object.entries(versionsData).map(([repo, versions]) => {
        const v = versions as { installed?: string; latest?: string };
        const installed = v.installed || 'unknown';
        const latest = v.latest || 'unknown';
        // Normalize versions for comparison (remove 'v' prefix)
        const updateAvailable =
          latest !== 'unknown' &&
          this.normalizeVersion(installed) !== this.normalizeVersion(latest);
        return {
          repository: repo,
          installed,
          latest,
          updateAvailable,
        };
      });

      return {
        repositories,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `Failed to get system versions: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get available versions for a specific repository
   */
  async getAvailableVersions(repository: string): Promise<string[]> {
    if (!(await this.isUpdateScriptAvailable())) {
      throw new Error('Update script not available. Version management is not supported on this system.');
    }

    this.validateRepositoryName(repository);

    try {
      const scriptPath = await this.getUpdateScript();
      const { stdout } = await execFileAsync(scriptPath, ['available', repository]);
      const versions = stdout
        .trim()
        .split('\n')
        .filter((v) => v.length > 0);

      return versions;
    } catch (error) {
      throw new Error(
        `Failed to get available versions for ${repository}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the currently installed version for a specific repository
   */
  async getInstalledVersion(repository: string): Promise<string> {
    // Validate repository name against whitelist - this prevents any path traversal
    this.validateRepositoryName(repository);

    // After validation, we know repository is one of the allowed values from VALID_REPOSITORIES
    // Reconstruct the path using only the validated repository name to break the taint chain
    // This satisfies CodeQL's requirements for preventing path injection
    const versionFile = path.join(this.reposBasePath, repository, '.lacylights-version');
    const resolvedPath = path.resolve(versionFile);
    const expectedBasePath = path.resolve(this.reposBasePath);

    // Defense in depth: verify the resolved path is within the expected base directory
    // Path must either start with base directory + separator, or equal the base directory itself
    const isWithinBase =
      resolvedPath.startsWith(expectedBasePath + path.sep) ||
      resolvedPath === expectedBasePath;

    if (!isWithinBase) {
      throw new Error(`Invalid repository path: ${repository}`);
    }

    // Use the validated path - repository is guaranteed to be from VALID_REPOSITORIES
    // so this is safe from path injection attacks
    // codeql[js/path-injection] - repository is validated against VALID_REPOSITORIES whitelist
    const safePath = path.join(this.reposBasePath, repository, '.lacylights-version');

    try {
      // codeql[js/path-injection] - safePath is constructed from validated repository name
      const version = await fs.readFile(safePath, 'utf-8');
      return version.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Update a repository to a specific version
   */
  async updateRepository(repository: string, version = 'latest'): Promise<UpdateResult> {
    if (!(await this.isUpdateScriptAvailable())) {
      throw new Error('Update script not available. Version management is not supported on this system.');
    }

    this.validateRepositoryName(repository);
    this.validateVersion(version);

    const previousVersion = await this.getInstalledVersion(repository);

    try {
      const scriptPath = await this.getUpdateScript();
      await execFileAsync(scriptPath, ['update', repository, version], {
        timeout: VersionManagementService.UPDATE_TIMEOUT_MS,
      });

      const newVersion = await this.getInstalledVersion(repository);

      return {
        success: true,
        repository,
        previousVersion,
        newVersion,
        message: `Successfully updated ${repository} from ${previousVersion} to ${newVersion}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        repository,
        previousVersion,
        newVersion: previousVersion,
        error: `Failed to update ${repository}: ${errorMessage}`,
      };
    }
  }

  /**
   * Update all repositories to their latest versions
   */
  async updateAllRepositories(): Promise<UpdateResult[]> {
    if (!(await this.isUpdateScriptAvailable())) {
      throw new Error('Update script not available. Version management is not supported on this system.');
    }

    // Run updates in parallel for efficiency
    const results = await Promise.all(
      VersionManagementService.VALID_REPOSITORIES.map(repo =>
        this.updateRepository(repo, 'latest')
      )
    );

    return results;
  }

  /**
   * Check if running on a system that supports version management (typically RPi)
   */
  static isVersionManagementSupported(): boolean {
    // Version management is supported if the update script exists
    try {
      return existsSync('/opt/lacylights/scripts/update-repos.sh');
    } catch {
      return false;
    }
  }
}

// Singleton instance
let versionManagementServiceInstance: VersionManagementService | null = null;

export function getVersionManagementService(): VersionManagementService {
  if (!versionManagementServiceInstance) {
    versionManagementServiceInstance = new VersionManagementService();
  }
  return versionManagementServiceInstance;
}
