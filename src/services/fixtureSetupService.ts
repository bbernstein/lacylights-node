/* eslint-disable no-console */
import { PrismaClient, FixtureType, ChannelType } from "@prisma/client";
import https from "https";
import fs from "fs";
import path from "path";
import unzipper from "unzipper";

const prisma = new PrismaClient();

interface OFLManufacturer {
  name: string;
  website?: string;
  rdmId?: number;
  comment?: string;
}

interface OFLManufacturers {
  [key: string]: OFLManufacturer;
}

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

interface OFLPhysical {
  dimensions?: [number, number, number];
  weight?: number;
  power?: number;
  DMXconnector?: string;
  bulb?: {
    type?: string;
  };
  lens?: {
    degreesMinMax?: [number, number];
  };
}

interface OFLMode {
  name: string;
  shortName?: string;
  channels: string[];
}

interface OFLFixture {
  $schema: string;
  name: string;
  categories: string[];
  meta?: {
    authors?: string[];
    createDate?: string;
    lastModifyDate?: string;
  };
  links?: {
    manual?: string[];
    productPage?: string[];
    video?: string[];
  };
  physical?: OFLPhysical;
  availableChannels: {
    [channelName: string]: OFLChannel;
  };
  modes: OFLMode[];
}

export class FixtureSetupService {
  private static readonly OFL_DOWNLOAD_URL =
    "https://open-fixture-library.org/download.ofl";
  private static readonly TEMP_DIR = path.join(process.cwd(), "temp");
  private static readonly OFL_ZIP_PATH = path.join(
    FixtureSetupService.TEMP_DIR,
    "ofl.zip",
  );
  private static readonly OFL_EXTRACT_PATH = path.join(
    FixtureSetupService.TEMP_DIR,
    "ofl",
  );

  /**
   * Check if fixtures need to be populated and populate them if necessary
   */
  static async ensureFixturesPopulated(): Promise<void> {
    try {
      const fixtureCount = await prisma.fixtureDefinition.count();

      if (fixtureCount === 0) {
        console.log(
          "🎭 No fixture definitions found. Starting initial fixture import...",
        );
        await this.downloadAndImportFixtures();
      } else {
        console.log(`✓ Found ${fixtureCount} fixture definitions in database`);
      }
    } catch (error) {
      console.error("❌ Error checking fixture definitions:", error);
      throw error;
    }
  }

  /**
   * Download OFL data and import fixtures
   */
  private static async downloadAndImportFixtures(): Promise<void> {
    try {
      // Create temp directory
      if (!fs.existsSync(this.TEMP_DIR)) {
        fs.mkdirSync(this.TEMP_DIR, { recursive: true });
      }

      console.log("📥 Downloading Open Fixture Library data...");
      await this.downloadOFLData();

      console.log("📦 Extracting fixture data...");
      await this.extractOFLData();

      // Check extraction directory
      console.log("  Checking extracted data...");
      const extractedDirs = fs
        .readdirSync(this.OFL_EXTRACT_PATH)
        .filter((item) =>
          fs.statSync(path.join(this.OFL_EXTRACT_PATH, item)).isDirectory(),
        );
      console.log(`  Found ${extractedDirs.length} manufacturer directories`);

      console.log("💾 Importing fixtures into database...");
      await this.importFixtures();

      console.log("✅ Fixture import completed successfully!");

      // Only cleanup on success
      console.log("🧹 Cleaning up temporary files...");
      await this.cleanup();
    } catch (error) {
      console.error("❌ Error during fixture setup:", error);
      // Don't cleanup on error for debugging
      console.log("⚠️  Temporary files preserved in:", this.TEMP_DIR);
      throw error;
    }
  }

  /**
   * Download OFL zip file
   */
  private static async downloadOFLData(): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(this.OFL_ZIP_PATH);

      https
        .get(this.OFL_DOWNLOAD_URL, (response) => {
          if (response.statusCode !== 200) {
            reject(
              new Error(`Failed to download OFL data: ${response.statusCode}`),
            );
            return;
          }

          const totalSize = parseInt(
            response.headers["content-length"] || "0",
            10,
          );
          let downloadedSize = 0;
          let lastLoggedProgress = 0;

          if (totalSize > 0) {
            response.on("data", (chunk) => {
              downloadedSize += chunk.length;
              const progress = Math.round((downloadedSize / totalSize) * 100);

              // Log progress every 10%
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
          fs.unlinkSync(this.OFL_ZIP_PATH);
          reject(err);
        });
    });
  }

  /**
   * Extract OFL zip file
   */
  private static async extractOFLData(): Promise<void> {
    // Create extraction directory
    if (!fs.existsSync(this.OFL_EXTRACT_PATH)) {
      fs.mkdirSync(this.OFL_EXTRACT_PATH, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      fs.createReadStream(this.OFL_ZIP_PATH)
        .pipe(unzipper.Extract({ path: this.OFL_EXTRACT_PATH }))
        .on("close", () => {
          console.log("  Extraction complete!");
          resolve();
        })
        .on("error", (err) => {
          console.error("  Extraction error:", err);
          reject(err);
        });
    });
  }

  /**
   * Import fixtures from extracted OFL data
   */
  private static async importFixtures(): Promise<void> {
    // Since manufacturers.json doesn't exist, build manufacturers from directories
    const manufacturerDirs = fs
      .readdirSync(this.OFL_EXTRACT_PATH)
      .filter((item) => {
        const itemPath = path.join(this.OFL_EXTRACT_PATH, item);
        return fs.statSync(itemPath).isDirectory();
      });

    // Create manufacturers data from directory names
    const manufacturersData: OFLManufacturers = {};
    manufacturerDirs.forEach((dir) => {
      // Convert directory name to manufacturer name (e.g., "american-dj" -> "American DJ")
      const name = dir
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      manufacturersData[dir] = { name };
    });

    let totalFixtures = 0;
    let successfulImports = 0;
    let errors = 0;

    // Process each manufacturer directory
    for (const manufacturerKey of Object.keys(manufacturersData)) {
      const manufacturerPath = path.join(
        this.OFL_EXTRACT_PATH,
        manufacturerKey,
      );

      if (
        !fs.existsSync(manufacturerPath) ||
        !fs.statSync(manufacturerPath).isDirectory()
      ) {
        continue;
      }

      const manufacturerName = manufacturersData[manufacturerKey].name;
      console.log(`  Processing ${manufacturerName}...`);

      // Get all fixture files for this manufacturer
      const fixtureFiles = fs
        .readdirSync(manufacturerPath)
        .filter((file) => file.endsWith(".json"));

      for (const fixtureFile of fixtureFiles) {
        totalFixtures++;
        const fixturePath = path.join(manufacturerPath, fixtureFile);

        try {
          const oflFixture: OFLFixture = JSON.parse(
            fs.readFileSync(fixturePath, "utf8"),
          );

          // Skip fixtures without modes
          if (!oflFixture.modes || oflFixture.modes.length === 0) {
            continue;
          }

          // Check if fixture already exists
          const existing = await prisma.fixtureDefinition.findUnique({
            where: {
              manufacturer_model: {
                manufacturer: manufacturerName,
                model: oflFixture.name,
              },
            },
          });

          if (existing) {
            continue;
          }

          // Get all unique channels from all modes
          const allChannelNames = new Set<string>();
          oflFixture.modes.forEach((mode) => {
            mode.channels.forEach((channelName) =>
              allChannelNames.add(channelName),
            );
          });

          // Create channel definitions for all unique channels
          const channelDefinitions = Array.from(allChannelNames).map(
            (channelName, index) => {
              const oflChannel = oflFixture.availableChannels[channelName];

              // Use the first capability or the single capability
              const capability = oflChannel.capabilities
                ? oflChannel.capabilities[0]
                : oflChannel.capability;

              if (!capability) {
                throw new Error(
                  `No capability found for channel: ${channelName}`,
                );
              }

              const { min, max } = this.getMinMaxValues(capability);

              return {
                name: channelName,
                type: this.mapChannelType(capability),
                offset: index + 1,
                minValue: min,
                maxValue: max,
                defaultValue: this.getDefaultValue(capability),
              };
            },
          );

          // Create the fixture definition with channels
          const fixtureDefinition = await prisma.fixtureDefinition.create({
            data: {
              manufacturer: manufacturerName,
              model: oflFixture.name,
              type: this.mapFixtureType(oflFixture.categories),
              isBuiltIn: true,
              channels: {
                create: channelDefinitions,
              },
            },
            include: {
              channels: true,
            },
          });

          // Create modes for this fixture
          for (const oflMode of oflFixture.modes) {
            await prisma.fixtureMode.create({
              data: {
                name: oflMode.name,
                shortName: oflMode.shortName || null,
                channelCount: oflMode.channels.length,
                definitionId: fixtureDefinition.id,
                modeChannels: {
                  create: oflMode.channels.map((channelName, offset) => {
                    const channelDef = fixtureDefinition.channels.find(
                      (ch) => ch.name === channelName,
                    );
                    if (!channelDef) {
                      throw new Error(
                        `Channel ${channelName} not found for mode ${oflMode.name}`,
                      );
                    }
                    return {
                      offset: offset + 1,
                      channelId: channelDef.id,
                    };
                  }),
                },
              },
            });
          }

          successfulImports++;

          // Log progress every 100 fixtures
          if (successfulImports % 100 === 0) {
            console.log(`    Imported ${successfulImports} fixtures...`);
          }
        } catch {
          errors++;
        }
      }
    }

    console.log("\n📊 Import Summary:");
    console.log(`  Total fixtures processed: ${totalFixtures}`);
    console.log(`  Successfully imported: ${successfulImports}`);
    console.log(`  Errors: ${errors}`);
    console.log(
      `  Skipped (already exist): ${totalFixtures - successfulImports - errors}`,
    );
  }

  /**
   * Map OFL channel types to our ChannelType enum
   */
  private static mapChannelType(oflCapability: OFLCapability): ChannelType {
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

  /**
   * Map OFL categories to our FixtureType enum
   */
  private static mapFixtureType(categories: string[]): FixtureType {
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

  /**
   * Get default value for a capability
   */
  private static getDefaultValue(capability: OFLCapability): number {
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

  /**
   * Get min/max values for a capability
   */
  private static getMinMaxValues(capability: OFLCapability): {
    min: number;
    max: number;
  } {
    if (capability.dmxRange) {
      return { min: capability.dmxRange[0], max: capability.dmxRange[1] };
    }
    return { min: 0, max: 255 };
  }

  /**
   * Clean up temporary files
   */
  private static async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.OFL_ZIP_PATH)) {
        fs.unlinkSync(this.OFL_ZIP_PATH);
      }
      if (fs.existsSync(this.OFL_EXTRACT_PATH)) {
        fs.rmSync(this.OFL_EXTRACT_PATH, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn("Warning: Could not clean up temporary files:", error);
    }
  }
}
