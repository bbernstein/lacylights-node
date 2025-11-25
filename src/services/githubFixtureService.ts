/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import https from "https";
import { FixtureType, ChannelType } from "../types/enums";
import {
  IFileSystemService,
  FileSystemService,
} from "./abstractions/FileSystemService";
import { IPathService, PathService } from "./abstractions/PathService";
import {
  IDatabaseService,
  DatabaseService,
  FixtureDefinition,
} from "./abstractions/DatabaseService";

/**
 * Interface for GitHub API content response
 */
interface GitHubContentItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: "file" | "dir";
}

/**
 * OFL Fixture format interfaces (same as fixtureSetupService)
 */
interface OFLCapability {
  type: string;
  color?: string;
  brightnessStart?: string;
  brightnessEnd?: string;
  dmxRange?: [number, number];
  comment?: string;
  speedStart?: string;
  speedEnd?: string;
  shutterEffect?: string;
  effectName?: string;
  colorTemperature?: string;
  colors?: string[];
  colorsStart?: string[];
  colorsEnd?: string[];
}

interface OFLChannel {
  capability?: OFLCapability;
  capabilities?: OFLCapability[];
}

interface OFLMode {
  name: string;
  shortName?: string;
  channels: string[];
}

interface OFLFixture {
  name: string;
  shortName?: string;
  categories: string[];
  meta?: {
    authors?: string[];
    createDate?: string;
    lastModifyDate?: string;
    importPlugin?: {
      plugin: string;
      date: string;
      comment?: string;
    };
  };
  modes: OFLMode[];
  availableChannels: { [key: string]: OFLChannel };
}

interface OFLData {
  [manufacturer: string]: {
    [fixture: string]: OFLFixture;
  };
}

export interface GitHubFixtureConfig {
  owner: string;
  repo: string;
  branch: string;
  fixturesPath: string;
  tempDir: string;
  oflJsonPath: string;
  requestTimeoutMs: number;
  maxConcurrentRequests: number;
  maxRedirects: number;
  maxResponseSizeBytes: number;
}

/**
 * GitHubFixtureService downloads fixture definitions from the Open Fixture Library
 * GitHub repository instead of the OFL website. This provides an alternative source
 * when the OFL website is unavailable.
 *
 * Uses the GitHub API to list directories and download raw files.
 */
export class GitHubFixtureService {
  private readonly config: GitHubFixtureConfig;

  constructor(
    private readonly fileSystem: IFileSystemService,
    private readonly pathService: IPathService,
    private readonly database: IDatabaseService,
    config?: Partial<GitHubFixtureConfig>
  ) {
    const defaultConfig: GitHubFixtureConfig = {
      owner: "OpenLightingProject",
      repo: "open-fixture-library",
      branch: "master",
      fixturesPath: "fixtures",
      tempDir: this.pathService.join(process.cwd(), "temp"),
      oflJsonPath: this.pathService.join(process.cwd(), "temp", "ofl-github.json"),
      requestTimeoutMs: 30000,
      maxConcurrentRequests: 5,
      maxRedirects: 5,
      maxResponseSizeBytes: 10 * 1024 * 1024, // 10 MB
    };

    this.config = { ...defaultConfig, ...config };
  }

  get testConfig(): GitHubFixtureConfig {
    return this.config;
  }

  /**
   * Creates a GitHubFixtureService instance with all dependencies injected.
   */
  static create(prisma?: PrismaClient): GitHubFixtureService {
    const fileSystem = new FileSystemService();
    const pathService = new PathService();
    const database = new DatabaseService(prisma || new PrismaClient());

    return new GitHubFixtureService(fileSystem, pathService, database);
  }

  /**
   * Static method for backward compatibility.
   * Ensures that fixture definitions are populated in the database.
   */
  static async ensureFixturesPopulated(prisma?: PrismaClient): Promise<void> {
    const service = GitHubFixtureService.create(prisma);
    await service.ensureFixturesPopulated();
  }

  async ensureFixturesPopulated(): Promise<void> {
    try {
      if (process.env.SKIP_FIXTURE_IMPORT === "true") {
        console.log("Skipping fixture import (SKIP_FIXTURE_IMPORT=true)");
        return;
      }

      const fixtureCount = await this.database.getFixtureCount();

      if (fixtureCount === 0) {
        console.log(
          "No fixture definitions found. Starting import from GitHub..."
        );
        await this.downloadAndImportFixtures();
      } else {
        console.log(`Found ${fixtureCount} fixture definitions in database`);
      }
    } catch (error) {
      console.error("Error ensuring fixtures populated from GitHub:", error);
      throw error;
    }
  }

  async downloadAndImportFixtures(): Promise<void> {
    try {
      await this.ensureTempDirectory();

      if (!this.fileSystem.existsSync(this.config.oflJsonPath)) {
        console.log("Downloading fixture data from GitHub...");
        const oflData = await this.downloadFixturesFromGitHub();

        // Save processed data
        this.fileSystem.writeFileSync(
          this.config.oflJsonPath,
          JSON.stringify(oflData),
          "utf8"
        );
        console.log("Fixture data downloaded and processed successfully!");
      }

      await this.importFixtures();
      console.log("Fixture import from GitHub completed successfully!");
    } catch (error) {
      console.error("Error downloading and importing fixtures from GitHub:", error);
      throw error;
    }
  }

  private async ensureTempDirectory(): Promise<void> {
    if (!this.fileSystem.existsSync(this.config.tempDir)) {
      this.fileSystem.mkdirSync(this.config.tempDir, { recursive: true });
    }
  }

  /**
   * Download all fixtures from GitHub repository
   */
  private async downloadFixturesFromGitHub(): Promise<OFLData> {
    const oflData: OFLData = {};

    // Get list of manufacturer directories
    console.log("  Fetching manufacturer list...");
    const fixturesContents = await this.getGitHubContents(this.config.fixturesPath);

    const manufacturers = fixturesContents.filter(
      (item) => item.type === "dir"
    );

    console.log(`  Found ${manufacturers.length} manufacturers`);

    // Process manufacturers in batches to avoid rate limiting
    const batchSize = this.config.maxConcurrentRequests;
    let processedCount = 0;

    for (let i = 0; i < manufacturers.length; i += batchSize) {
      const batch = manufacturers.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (manufacturer) => {
          try {
            const manufacturerData = await this.downloadManufacturerFixtures(
              manufacturer.name,
              manufacturer.path
            );

            if (Object.keys(manufacturerData).length > 0) {
              oflData[manufacturer.name] = manufacturerData;
            }

            processedCount++;
            if (processedCount % 20 === 0) {
              console.log(`  Progress: ${processedCount}/${manufacturers.length} manufacturers`);
            }
          } catch (error) {
            console.warn(
              `  Warning: Failed to download fixtures for ${manufacturer.name}:`,
              (error as Error).message
            );
          }
        })
      );
    }

    console.log(`  Downloaded fixtures from ${Object.keys(oflData).length} manufacturers`);
    return oflData;
  }

  /**
   * Download all fixtures for a specific manufacturer
   */
  private async downloadManufacturerFixtures(
    manufacturerName: string,
    manufacturerPath: string
  ): Promise<{ [fixtureName: string]: OFLFixture }> {
    const fixtures: { [fixtureName: string]: OFLFixture } = {};

    const contents = await this.getGitHubContents(manufacturerPath);
    const jsonFiles = contents.filter(
      (item) => item.type === "file" && item.name.endsWith(".json")
    );

    for (const file of jsonFiles) {
      try {
        if (file.download_url) {
          const fixtureData = await this.downloadRawFile(file.download_url);
          const fixtureName = this.pathService.basename(file.name, ".json");
          fixtures[fixtureName] = fixtureData;
        } else {
          console.warn(
            `    Warning: Skipping ${manufacturerName}/${file.name} - download_url is missing`
          );
        }
      } catch (error) {
        console.warn(
          `    Warning: Failed to download ${manufacturerName}/${file.name}:`,
          (error as Error).message
        );
      }
    }

    return fixtures;
  }

  /**
   * Get contents of a directory from GitHub API
   */
  private async getGitHubContents(path: string): Promise<GitHubContentItem[]> {
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch}`;

    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          "User-Agent": "LacyLights-Fixture-Importer",
          "Accept": "application/vnd.github.v3+json",
        },
        timeout: this.config.requestTimeoutMs,
      };

      const request = https.get(url, options, (response) => {
        if (response.statusCode === 403) {
          reject(new Error("GitHub API rate limit exceeded. Please try again later."));
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`GitHub API error: ${response.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;
        let aborted = false;

        response.on("data", (chunk) => {
          if (aborted) {return;}
          totalSize += chunk.length;
          if (totalSize > this.config.maxResponseSizeBytes) {
            aborted = true;
            request.destroy();
            reject(new Error(`GitHub API response size exceeds maximum allowed (${this.config.maxResponseSizeBytes} bytes)`));
            return;
          }
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          if (aborted) {return;}
          try {
            const data = Buffer.concat(chunks, totalSize).toString("utf8");
            const contents = JSON.parse(data) as GitHubContentItem[];
            resolve(contents);
          } catch (error) {
            reject(new Error(`Failed to parse GitHub response: ${(error as Error).message}`));
          }
        });
      });

      request.on("error", (error) => {
        reject(error);
      });

      request.on("timeout", () => {
        request.destroy();
        reject(new Error("GitHub API request timed out"));
      });
    });
  }

  /**
   * Download a raw file from GitHub
   */
  private async downloadRawFile(downloadUrl: string, redirectCount = 0): Promise<OFLFixture> {
    // Check redirect limit to prevent infinite recursion
    if (redirectCount >= this.config.maxRedirects) {
      throw new Error(`Maximum redirect limit (${this.config.maxRedirects}) exceeded`);
    }

    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          "User-Agent": "LacyLights-Fixture-Importer",
        },
        timeout: this.config.requestTimeoutMs,
      };

      const request = https.get(downloadUrl, options, (response) => {
        // Handle redirects with limit
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadRawFile(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download file: ${response.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;
        let aborted = false;

        response.on("data", (chunk) => {
          if (aborted) {return;}
          totalSize += chunk.length;
          if (totalSize > this.config.maxResponseSizeBytes) {
            aborted = true;
            request.destroy();
            reject(new Error(`Response size exceeds maximum allowed (${this.config.maxResponseSizeBytes} bytes)`));
            return;
          }
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          if (aborted) {return;}
          try {
            const data = Buffer.concat(chunks, totalSize).toString("utf8");
            const fixture = JSON.parse(data) as OFLFixture;
            resolve(fixture);
          } catch (error) {
            reject(new Error(`Failed to parse fixture JSON: ${(error as Error).message}`));
          }
        });
      });

      request.on("error", (error) => {
        reject(error);
      });

      request.on("timeout", () => {
        request.destroy();
        reject(new Error("File download timed out"));
      });
    });
  }

  /**
   * Import fixtures from the downloaded JSON data
   */
  private async importFixtures(): Promise<void> {
    try {
      console.log("Importing fixture definitions...");

      const oflData: OFLData = JSON.parse(
        this.fileSystem.readFileSync(this.config.oflJsonPath)
      );
      const fixtureDefinitions: FixtureDefinition[] = [];

      for (const [manufacturerSlug, fixtures] of Object.entries(oflData)) {
        const manufacturerName = this.formatManufacturerName(manufacturerSlug);

        for (const [fixtureName, oflFixture] of Object.entries(fixtures)) {
          try {
            if (oflFixture.modes && oflFixture.modes.length > 0) {
              type ChannelDef = {
                name: string;
                type: ChannelType;
                offset: number;
                minValue: number;
                maxValue: number;
                defaultValue: number;
              };
              const channelMap = new Map<string, ChannelDef>();
              let nextOffset = 1;

              for (const mode of oflFixture.modes) {
                for (const channelName of mode.channels) {
                  if (!channelMap.has(channelName)) {
                    const capability = oflFixture.availableChannels?.[channelName];
                    if (capability) {
                      const channelCapability =
                        capability.capability ||
                        (capability.capabilities && capability.capabilities[0]);

                      if (channelCapability) {
                        const { min, max } = this.getMinMaxValues(channelCapability);
                        channelMap.set(channelName, {
                          name: channelName,
                          type: this.mapChannelType(channelCapability),
                          offset: nextOffset++,
                          minValue: min,
                          maxValue: max,
                          defaultValue: this.getDefaultValue(channelCapability),
                        });
                      }
                    }
                  }
                }
              }

              const channelDefinitions = Array.from(channelMap.values());

              if (channelDefinitions.length > 0) {
                const modes = oflFixture.modes.map((mode) => ({
                  name: mode.name,
                  shortName: mode.shortName || null,
                  channelCount: mode.channels.length,
                  channels: mode.channels
                    .map((channelName, index) => {
                      const channelDef = channelMap.get(channelName);
                      if (!channelDef) {
                        return null;
                      }

                      return {
                        offset: index + 1,
                        channelName: channelName,
                      };
                    })
                    .filter((mc): mc is NonNullable<typeof mc> => mc !== null),
                }));

                fixtureDefinitions.push({
                  manufacturer: manufacturerName,
                  model: oflFixture.name,
                  type: this.mapFixtureType(oflFixture.categories),
                  isBuiltIn: true,
                  channels: {
                    create: channelDefinitions,
                  },
                  modes: modes,
                });
              }
            }
          } catch (error) {
            console.warn(
              `  Warning: Could not process fixture ${manufacturerName} ${fixtureName}:`,
              (error as Error).message
            );
          }
        }
      }

      if (fixtureDefinitions.length > 0) {
        const result = await this.database.createFixtures(fixtureDefinitions);
        console.log(
          `Successfully imported ${result.count} fixture definitions from GitHub`
        );
      } else {
        console.log("No valid fixture definitions found to import");
      }
    } catch (error) {
      console.error("Error importing fixtures:", error);
      throw error;
    }
  }

  formatManufacturerName(slug: string): string {
    return slug
      .split("-")
      .map((word) => {
        if (word.toLowerCase() === "dj") {return "DJ";}
        if (word.toLowerCase() === "led") {return "LED";}
        if (word.toLowerCase() === "dmx") {return "DMX";}
        if (word.toLowerCase() === "rgb") {return "RGB";}
        if (word.toLowerCase() === "rgbw") {return "RGBW";}
        if (word.toLowerCase() === "usa") {return "USA";}
        if (word.toLowerCase() === "uk") {return "UK";}

        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");
  }

  mapChannelType(oflCapability: OFLCapability): ChannelType {
    const type = oflCapability.type;
    const color = oflCapability.color?.toLowerCase();

    if (type === "Intensity") {
      return ChannelType.INTENSITY;
    }

    if (type === "ColorIntensity") {
      switch (color) {
        case "red":
          return ChannelType.RED;
        case "green":
          return ChannelType.GREEN;
        case "blue":
          return ChannelType.BLUE;
        case "white":
          return ChannelType.WHITE;
        case "amber":
          return ChannelType.AMBER;
        case "uv":
          return ChannelType.UV;
        default:
          return ChannelType.OTHER;
      }
    }

    if (type === "Pan") {return ChannelType.PAN;}
    if (type === "Tilt") {return ChannelType.TILT;}
    if (type === "Zoom") {return ChannelType.ZOOM;}
    if (type === "Focus") {return ChannelType.FOCUS;}
    if (type === "Iris") {return ChannelType.IRIS;}
    if (type === "Gobo") {return ChannelType.GOBO;}
    if (type === "ColorWheel") {return ChannelType.COLOR_WHEEL;}
    if (type === "Effect") {return ChannelType.EFFECT;}
    if (type === "ShutterStrobe") {return ChannelType.STROBE;}
    if (type === "Maintenance") {return ChannelType.MACRO;}

    return ChannelType.OTHER;
  }

  mapFixtureType(categories: string[]): FixtureType {
    const categoryString = categories.join(" ").toLowerCase();

    if (
      categoryString.includes("moving head") ||
      categoryString.includes("scanner")
    ) {
      return FixtureType.MOVING_HEAD;
    }
    if (
      categoryString.includes("strobe") ||
      categoryString.includes("blinder")
    ) {
      return FixtureType.STROBE;
    }
    if (categoryString.includes("dimmer")) {
      return FixtureType.DIMMER;
    }
    if (
      categoryString.includes("color changer") ||
      categoryString.includes("par") ||
      categoryString.includes("wash")
    ) {
      return FixtureType.LED_PAR;
    }

    return FixtureType.OTHER;
  }

  getDefaultValue(capability: OFLCapability): number {
    if (capability.dmxRange) {
      return capability.dmxRange[0];
    }
    if (
      capability.type === "Intensity" ||
      capability.type === "ColorIntensity"
    ) {
      return 0;
    }
    return 128;
  }

  getMinMaxValues(capability: OFLCapability): { min: number; max: number } {
    if (capability.dmxRange) {
      return { min: capability.dmxRange[0], max: capability.dmxRange[1] };
    }
    return { min: 0, max: 255 };
  }

  async cleanup(): Promise<void> {
    try {
      if (this.fileSystem.existsSync(this.config.oflJsonPath)) {
        this.fileSystem.unlinkSync(this.config.oflJsonPath);
        console.log("Cleaned up GitHub fixture cache file");
      }
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }
}
