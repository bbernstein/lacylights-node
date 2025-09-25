/* eslint-disable no-console */
import { FixtureType, ChannelType, PrismaClient } from "@prisma/client";
import { IFileSystemService, FileSystemService } from "./abstractions/FileSystemService";
import { IHttpService, HttpService } from "./abstractions/HttpService";
import { IPathService, PathService } from "./abstractions/PathService";
import { IDatabaseService, DatabaseService, FixtureDefinition } from "./abstractions/DatabaseService";
import { IArchiveService, ArchiveService } from "./abstractions/ArchiveService";

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

export interface FixtureSetupConfig {
  oflDownloadUrl: string;
  tempDir: string;
  oflZipPath: string;
  oflExtractPath: string;
  oflJsonPath: string;
}

/**
 * FixtureSetupService handles downloading and importing fixture definitions
 * from the Open Fixture Library into the application database.
 *
 * This service uses dependency injection for better testability and maintainability.
 * It provides both instance-based methods for flexible usage and static methods
 * for backward compatibility with existing code.
 */
export class FixtureSetupService {
  private readonly config: FixtureSetupConfig;

  constructor(
    private readonly fileSystem: IFileSystemService,
    private readonly http: IHttpService,
    private readonly pathService: IPathService,
    private readonly database: IDatabaseService,
    private readonly archive: IArchiveService,
    config?: Partial<FixtureSetupConfig>
  ) {
    const defaultConfig: FixtureSetupConfig = {
      oflDownloadUrl: "https://github.com/OpenLightingProject/open-fixture-library/archive/master.zip",
      tempDir: this.pathService.join(process.cwd(), "temp"),
      oflZipPath: this.pathService.join(process.cwd(), "temp", "ofl.zip"),
      oflExtractPath: this.pathService.join(process.cwd(), "temp", "extract"),
      oflJsonPath: this.pathService.join(process.cwd(), "temp", "ofl.json"),
    };

    this.config = { ...defaultConfig, ...config };
  }

  get testConfig(): FixtureSetupConfig {
    return this.config;
  }

  /**
   * Creates a FixtureSetupService instance with all dependencies injected.
   * This is the recommended way to create instances for production use.
   */
  static create(prisma?: PrismaClient): FixtureSetupService {
    const fileSystem = new FileSystemService();
    const http = new HttpService();
    const pathService = new PathService();
    const database = new DatabaseService(prisma || new PrismaClient());
    const archive = new ArchiveService(fileSystem);

    return new FixtureSetupService(fileSystem, http, pathService, database, archive);
  }

  /**
   * Static method for backward compatibility with existing code.
   * Ensures that fixture definitions are populated in the database.
   * If no fixtures exist, downloads and imports from Open Fixture Library.
   */
  static async ensureFixturesPopulated(prisma?: PrismaClient): Promise<void> {
    const service = FixtureSetupService.create(prisma);
    await service.ensureFixturesPopulated();
  }

  async ensureFixturesPopulated(): Promise<void> {
    try {
      const fixtureCount = await this.database.getFixtureCount();

      if (fixtureCount === 0) {
        console.log("🎭 No fixture definitions found. Starting initial fixture import...");
        await this.downloadAndImportFixtures();
      } else {
        console.log(`✓ Found ${fixtureCount} fixture definitions in database`);
      }
    } catch (error) {
      console.error("Error ensuring fixtures populated:", error);
      throw error;
    }
  }

  async downloadAndImportFixtures(): Promise<void> {
    try {
      await this.ensureTempDirectory();

      if (!this.fileSystem.existsSync(this.config.oflJsonPath)) {
        await this.downloadOFLData();
        await this.extractOFLData();
        await this.processExtractedData();
      }

      await this.importFixtures();
      console.log("✅ Fixture import completed successfully!");
    } catch (error) {
      console.error("Error downloading and importing fixtures:", error);
      throw error;
    }
  }

  private async ensureTempDirectory(): Promise<void> {
    if (!this.fileSystem.existsSync(this.config.tempDir)) {
      this.fileSystem.mkdirSync(this.config.tempDir, { recursive: true });
    }
  }

  private async downloadOFLData(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("📥 Downloading Open Fixture Library data...");
      const file = this.fileSystem.createWriteStream(this.config.oflZipPath);

      this.http
        .get(this.config.oflDownloadUrl, (response) => {
          if (response.statusCode !== 200) {
            console.error(`Failed to download OFL fixtures. Status code: ${response.statusCode}`);
            reject(new Error(`Failed to download OFL fixtures. Status code: ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers["content-length"] || "0", 10);
          let downloadedSize = 0;
          let lastLoggedProgress = 0;

          if (totalSize > 0) {
            response.on("data", (chunk) => {
              downloadedSize += chunk.length;
              const progress = Math.round((downloadedSize / totalSize) * 100);

              if (progress >= lastLoggedProgress + 10) {
                console.log(`  Download progress: ${progress}%`);
                lastLoggedProgress = progress;
              }
            });
          } else {
            console.log("  Downloading... (size unknown)");
          }

          response.pipe(file);

          file.on("finish", () => {
            file.close();
            console.log("  Download complete!");
            resolve();
          });
        })
        .on("error", (err) => {
          console.error("Error downloading OFL fixtures:", err);
          if (this.fileSystem.existsSync(this.config.oflZipPath)) {
            this.fileSystem.unlinkSync(this.config.oflZipPath);
          }
          reject(err);
        });
    });
  }

  private async extractOFLData(): Promise<void> {
    try {
      console.log("📦 Extracting fixture data...");
      await this.archive.extractZip(this.config.oflZipPath, this.config.oflExtractPath);
      console.log("  Extraction complete!");
    } catch (error) {
      console.error("Error extracting OFL data:", error);
      throw error;
    }
  }

  private async processExtractedData(): Promise<void> {
    try {
      console.log("  Checking extracted data...");
      const extractedDirs = this.fileSystem
        .readdirSync(this.config.oflExtractPath)
        .filter((item) =>
          this.fileSystem.statSync(this.pathService.join(this.config.oflExtractPath, item)).isDirectory()
        );

      if (extractedDirs.length === 0) {
        throw new Error("No directories found in extracted OFL data");
      }

      const oflDir = extractedDirs[0];
      const fixturesPath = this.pathService.join(this.config.oflExtractPath, oflDir, "fixtures");

      console.log("  Processing fixture data...");
      const oflData = await this.loadOFLData(fixturesPath);

      // Save processed data for importFixtures to use
      this.fileSystem.writeFileSync(this.config.oflJsonPath, JSON.stringify(oflData), 'utf8');
      console.log("  Fixture data processing complete!");
    } catch (error) {
      console.error("Error processing extracted data:", error);
      throw error;
    }
  }

  private async loadOFLData(fixturesPath: string): Promise<OFLData> {
    const oflData: OFLData = {};

    if (!this.fileSystem.existsSync(fixturesPath)) {
      throw new Error(`Fixtures directory not found: ${fixturesPath}`);
    }

    const manufacturers = this.fileSystem.readdirSync(fixturesPath)
      .filter(item => this.fileSystem.statSync(this.pathService.join(fixturesPath, item)).isDirectory());

    for (const manufacturer of manufacturers) {
      const manufacturerPath = this.pathService.join(fixturesPath, manufacturer);
      const fixtures = this.fileSystem.readdirSync(manufacturerPath)
        .filter(file => file.endsWith('.json'));

      if (fixtures.length > 0) {
        oflData[manufacturer] = {};

        for (const fixtureFile of fixtures) {
          const fixturePath = this.pathService.join(manufacturerPath, fixtureFile);
          try {
            const fixtureData = JSON.parse(this.fileSystem.readFileSync(fixturePath));
            const fixtureName = this.pathService.basename(fixtureFile, '.json');
            oflData[manufacturer][fixtureName] = fixtureData;
          } catch (error) {
            console.warn(`  Warning: Could not parse fixture file ${fixturePath}:`, (error as Error).message);
          }
        }
      }
    }

    return oflData;
  }

  private async importFixtures(): Promise<void> {
    try {
      console.log("📊 Importing fixture definitions...");

      const oflData: OFLData = JSON.parse(this.fileSystem.readFileSync(this.config.oflJsonPath));
      const fixtureDefinitions: FixtureDefinition[] = [];

      for (const [manufacturerName, fixtures] of Object.entries(oflData)) {
        for (const [fixtureName, oflFixture] of Object.entries(fixtures)) {
          try {
            if (oflFixture.modes && oflFixture.modes.length > 0) {
              const mode = oflFixture.modes[0]; // Use first mode for now
              const channelDefinitions = mode.channels
                .map((channelName, index) => {
                  const capability = oflFixture.availableChannels?.[channelName];
                  if (!capability) {
                    return null;
                  }

                  const channelCapability = capability.capability ||
                    (capability.capabilities && capability.capabilities[0]);

                  if (!channelCapability) {
                    return null;
                  }

                  const { min, max } = this.getMinMaxValues(channelCapability);
                  return {
                    name: channelName,
                    type: this.mapChannelType(channelCapability),
                    offset: index + 1,
                    minValue: min,
                    maxValue: max,
                    defaultValue: this.getDefaultValue(channelCapability),
                  };
                })
                .filter((channel): channel is NonNullable<typeof channel> => channel !== null);

              if (channelDefinitions.length > 0) {
                fixtureDefinitions.push({
                  manufacturer: manufacturerName,
                  model: oflFixture.name,
                  type: this.mapFixtureType(oflFixture.categories),
                  isBuiltIn: true,
                  channels: {
                    create: channelDefinitions,
                  },
                });
              }
            }
          } catch (error) {
            console.warn(`  Warning: Could not process fixture ${manufacturerName} ${fixtureName}:`, (error as Error).message);
          }
        }
      }

      if (fixtureDefinitions.length > 0) {
        const result = await this.database.createFixtures(fixtureDefinitions);
        console.log(`Successfully imported ${result.count} fixture definitions`);
      } else {
        console.log("No valid fixture definitions found to import");
      }
    } catch (error) {
      console.error("Error importing fixtures:", error);
      throw error;
    }
  }

  // Utility methods - these can now be tested independently
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

    if (type === "Pan") {
      return ChannelType.PAN;
    }
    if (type === "Tilt") {
      return ChannelType.TILT;
    }
    if (type === "Zoom") {
      return ChannelType.ZOOM;
    }
    if (type === "Focus") {
      return ChannelType.FOCUS;
    }
    if (type === "Iris") {
      return ChannelType.IRIS;
    }
    if (type === "Gobo") {
      return ChannelType.GOBO;
    }
    if (type === "ColorWheel") {
      return ChannelType.COLOR_WHEEL;
    }
    if (type === "Effect") {
      return ChannelType.EFFECT;
    }
    if (type === "ShutterStrobe") {
      return ChannelType.STROBE;
    }
    if (type === "Maintenance") {
      return ChannelType.MACRO;
    }

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

  getMinMaxValues(capability: OFLCapability): {
    min: number;
    max: number;
  } {
    if (capability.dmxRange) {
      return { min: capability.dmxRange[0], max: capability.dmxRange[1] };
    }
    return { min: 0, max: 255 };
  }

  async cleanup(): Promise<void> {
    try {
      if (this.fileSystem.existsSync(this.config.oflZipPath)) {
        this.fileSystem.unlinkSync(this.config.oflZipPath);
        console.log("Cleaned up OFL zip file");
      } else {
        console.log("OFL zip file not found, nothing to clean up");
      }
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }
}