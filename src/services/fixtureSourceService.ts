/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { FixtureSetupService } from "./fixtureSetupService";
import { GitHubFixtureService } from "./githubFixtureService";
import {
  IFileSystemService,
  FileSystemService,
} from "./abstractions/FileSystemService";
import { IPathService, PathService } from "./abstractions/PathService";
import {
  IDatabaseService,
  DatabaseService,
} from "./abstractions/DatabaseService";
import { IHttpService, HttpService } from "./abstractions/HttpService";
import { IArchiveService, ArchiveService } from "./abstractions/ArchiveService";

/**
 * Available fixture data sources
 */
export type FixtureSource = "ofl" | "github" | "auto";

export interface FixtureSourceConfig {
  /**
   * Primary source to use for fixture data.
   * - "ofl": Use open-fixture-library.org website (default)
   * - "github": Use GitHub repository directly
   * - "auto": Try OFL first, fall back to GitHub if it fails
   */
  source: FixtureSource;

  /**
   * Whether to enable fallback to alternative source on failure.
   * Only applicable when source is "ofl" or "github".
   * Default: true
   */
  enableFallback: boolean;
}

/**
 * FixtureSourceService is a unified service for downloading fixture definitions
 * from multiple sources. It supports the OFL website and GitHub repository,
 * with automatic fallback capabilities.
 *
 * Environment Variables:
 * - FIXTURE_SOURCE: "ofl" | "github" | "auto" (default: "auto")
 * - FIXTURE_FALLBACK_ENABLED: "true" | "false" (default: "true")
 * - SKIP_FIXTURE_IMPORT: "true" to skip fixture import entirely
 */
export class FixtureSourceService {
  private readonly config: FixtureSourceConfig;
  private readonly oflService: FixtureSetupService;
  private readonly githubService: GitHubFixtureService;

  constructor(
    fileSystem: IFileSystemService,
    http: IHttpService,
    pathService: IPathService,
    database: IDatabaseService,
    archive: IArchiveService,
    config?: Partial<FixtureSourceConfig>
  ) {
    const defaultConfig: FixtureSourceConfig = {
      source: (process.env.FIXTURE_SOURCE as FixtureSource) || "auto",
      enableFallback: process.env.FIXTURE_FALLBACK_ENABLED !== "false",
    };

    this.config = { ...defaultConfig, ...config };

    // Create both services for potential use
    this.oflService = new FixtureSetupService(
      fileSystem,
      http,
      pathService,
      database,
      archive
    );

    this.githubService = new GitHubFixtureService(
      fileSystem,
      pathService,
      database
    );
  }

  /**
   * Creates a FixtureSourceService instance with all dependencies injected.
   */
  static create(prisma?: PrismaClient): FixtureSourceService {
    const fileSystem = new FileSystemService();
    const http = new HttpService();
    const pathService = new PathService();
    const database = new DatabaseService(prisma || new PrismaClient());
    const archive = new ArchiveService(fileSystem);

    return new FixtureSourceService(
      fileSystem,
      http,
      pathService,
      database,
      archive
    );
  }

  /**
   * Static method for backward compatibility.
   * Ensures that fixture definitions are populated using the configured source.
   */
  static async ensureFixturesPopulated(prisma?: PrismaClient): Promise<void> {
    const service = FixtureSourceService.create(prisma);
    await service.ensureFixturesPopulated();
  }

  /**
   * Ensures fixture definitions are populated in the database.
   * Uses the configured source with optional fallback.
   */
  async ensureFixturesPopulated(): Promise<void> {
    if (process.env.SKIP_FIXTURE_IMPORT === "true") {
      console.log("Skipping fixture import (SKIP_FIXTURE_IMPORT=true)");
      return;
    }

    const { source, enableFallback } = this.config;

    console.log(`Fixture source configuration: ${source} (fallback: ${enableFallback})`);

    switch (source) {
      case "ofl":
        await this.tryOflWithFallback(enableFallback);
        break;
      case "github":
        await this.tryGitHubWithFallback(enableFallback);
        break;
      case "auto":
      default:
        await this.tryAutoWithFallback();
        break;
    }
  }

  /**
   * Try OFL website first, optionally fall back to GitHub
   */
  private async tryOflWithFallback(enableFallback: boolean): Promise<void> {
    try {
      console.log("Attempting to download fixtures from OFL website...");
      await this.oflService.ensureFixturesPopulated();
    } catch (error) {
      console.error("OFL website download failed:", (error as Error).message);

      if (enableFallback) {
        console.log("Falling back to GitHub repository...");
        await this.githubService.ensureFixturesPopulated();
      } else {
        throw error;
      }
    }
  }

  /**
   * Try GitHub first, optionally fall back to OFL website
   */
  private async tryGitHubWithFallback(enableFallback: boolean): Promise<void> {
    try {
      console.log("Attempting to download fixtures from GitHub...");
      await this.githubService.ensureFixturesPopulated();
    } catch (error) {
      console.error("GitHub download failed:", (error as Error).message);

      if (enableFallback) {
        console.log("Falling back to OFL website...");
        await this.oflService.ensureFixturesPopulated();
      } else {
        throw error;
      }
    }
  }

  /**
   * Auto mode: Try GitHub first (more reliable), fall back to OFL
   * GitHub is preferred as it's typically more available than the OFL website
   */
  private async tryAutoWithFallback(): Promise<void> {
    try {
      console.log("Auto mode: Attempting to download fixtures from GitHub...");
      await this.githubService.ensureFixturesPopulated();
    } catch (gitHubError) {
      console.error("GitHub download failed:", (gitHubError as Error).message);
      console.log("Attempting OFL website as fallback...");

      try {
        await this.oflService.ensureFixturesPopulated();
      } catch (oflError) {
        console.error("OFL website also failed:", (oflError as Error).message);
        throw new Error(
          `Failed to download fixtures from both sources. ` +
          `GitHub error: ${(gitHubError as Error).message}. ` +
          `OFL error: ${(oflError as Error).message}`
        );
      }
    }
  }

  /**
   * Clean up temporary files from both services
   */
  async cleanup(): Promise<void> {
    await this.oflService.cleanup();
    await this.githubService.cleanup();
  }

  /**
   * Get the currently configured source
   */
  getConfiguredSource(): FixtureSource {
    return this.config.source;
  }

  /**
   * Check if fallback is enabled
   */
  isFallbackEnabled(): boolean {
    return this.config.enableFallback;
  }
}
