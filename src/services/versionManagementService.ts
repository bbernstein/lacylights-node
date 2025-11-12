import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

export interface RepositoryVersion {
  repository: string;
  installed: string;
  latest: string;
  updateAvailable: boolean;
}

export interface SystemVersionInfo {
  repositories: RepositoryVersion[];
  lastChecked: string;
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
  private static readonly VERSION_PATTERN = /^(latest|v?\d+\.\d+\.\d+)$/;

  private updateScriptPath: string;
  private reposBasePath: string;

  constructor(
    updateScriptPath = '/opt/lacylights/scripts/update-repos.sh',
    reposBasePath = '/opt/lacylights/repos'
  ) {
    this.updateScriptPath = updateScriptPath;
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
        `Invalid version format: ${version}. Must be 'latest' or a semantic version (e.g., '1.2.3' or 'v1.2.3')`
      );
    }
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
   * Get version information for all repositories
   */
  async getSystemVersions(): Promise<SystemVersionInfo> {
    if (!(await this.isUpdateScriptAvailable())) {
      throw new Error('Update script not available. Version management is not supported on this system.');
    }

    try {
      const { stdout } = await execAsync(`${this.updateScriptPath} versions json`);
      const versionsData = JSON.parse(stdout);

      const repositories: RepositoryVersion[] = Object.entries(versionsData).map(([repo, versions]) => {
        const v = versions as { installed?: string; latest?: string };
        return {
          repository: repo,
          installed: v.installed || 'unknown',
          latest: v.latest || 'unknown',
          updateAvailable: v.installed !== v.latest && v.latest !== 'unknown',
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
      const { stdout } = await execAsync(`${this.updateScriptPath} available ${repository}`);
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
    const versionFile = path.join(this.reposBasePath, repository, '.lacylights-version');

    try {
      const version = await fs.readFile(versionFile, 'utf-8');
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
      await execAsync(`${this.updateScriptPath} update ${repository} ${version}`, {
        timeout: 300000, // 5 minute timeout
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
