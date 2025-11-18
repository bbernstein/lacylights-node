import { PrismaClient } from "@prisma/client";
import { FixtureType, ChannelType } from "../types/enums";

/**
 * OFL (Open Fixture Library) JSON Schema Types
 * Based on https://github.com/OpenLightingProject/open-fixture-library
 */

export interface OFLCapability {
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

export interface OFLChannel {
  capability?: OFLCapability;
  capabilities?: OFLCapability[];
  fineChannelAliases?: string[];
}

export interface OFLMode {
  name: string;
  shortName?: string;
  channels: string[];
}

export interface OFLFixture {
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

export interface ImportOFLFixtureResult {
  id: string;
  manufacturer: string;
  model: string;
  type: FixtureType;
}

/**
 * Service for importing OFL (Open Fixture Library) fixture definitions
 */
export class OFLImportService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Import a single fixture from OFL JSON format
   * @param manufacturer The manufacturer name
   * @param oflFixtureJson The OFL fixture JSON as a string
   * @param replace Whether to replace an existing fixture with the same name
   * @returns The created fixture definition
   */
  async importFixture(
    manufacturer: string,
    oflFixtureJson: string,
    replace = false,
  ): Promise<ImportOFLFixtureResult> {
    // Parse and validate the OFL JSON
    let oflFixture: OFLFixture;
    try {
      oflFixture = JSON.parse(oflFixtureJson);
    } catch (error) {
      throw new Error(
        `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Validate required fields
    this.validateOFLFixture(oflFixture);

    // Extract model name from the fixture
    const model = oflFixture.name;

    // Check if fixture already exists
    const existing = await this.prisma.fixtureDefinition.findUnique({
      where: {
        manufacturer_model: {
          manufacturer,
          model,
        },
      },
      include: {
        instances: true,
      },
    });

    if (existing && !replace) {
      throw new Error(
        `FIXTURE_EXISTS:${manufacturer} ${model}:${existing.instances.length}`,
      );
    }

    // Use a transaction to ensure atomicity
    return await this.prisma.$transaction(
      async (tx) => {
        // Delete existing fixture if replacing
        if (existing && replace) {
          // Delete the existing fixture (cascade will handle related records)
          await tx.fixtureDefinition.delete({
            where: { id: existing.id },
          });
        }

        // Map OFL fixture type to our FixtureType enum
        const fixtureType = this.mapFixtureType(oflFixture.categories);

        // Process channels - create a list of all unique channels
        const channelDefinitions = this.processChannels(
          oflFixture.availableChannels,
        );

        // Create the fixture definition with channels first
        const fixtureDefinition = await tx.fixtureDefinition.create({
          data: {
            manufacturer,
            model,
            type: fixtureType,
            isBuiltIn: false, // Custom imported fixtures are not built-in
            channels: {
              create: channelDefinitions.map((ch) => ({
                name: ch.name,
                type: ch.type,
                offset: ch.offset,
                minValue: ch.minValue,
                maxValue: ch.maxValue,
                defaultValue: ch.defaultValue,
              })),
            },
          },
          include: {
            channels: true,
          },
        });

        // Now create modes with references to the created channels
        // Build a map of channel names to their IDs
        const channelNameToId = new Map<string, string>();
        for (const channel of fixtureDefinition.channels) {
          channelNameToId.set(channel.name, channel.id);
        }

        // Create modes
        for (const oflMode of oflFixture.modes) {
          const mode = await tx.fixtureMode.create({
            data: {
              definitionId: fixtureDefinition.id,
              name: oflMode.name,
              shortName: oflMode.shortName,
              channelCount: oflMode.channels.length,
            },
          });

          // Create mode channels
          for (let i = 0; i < oflMode.channels.length; i++) {
            const channelName = oflMode.channels[i];

            // Handle switched channels (e.g., "Dimmer fine / Step Duration")
            // OFL uses " / " to separate channel aliases for switching channels
            // We'll use the first channel name as the primary channel for this mode
            const primaryChannelName = channelName.includes(" / ")
              ? channelName.split(" / ")[0]
              : channelName;

            const channelId = channelNameToId.get(primaryChannelName);

            if (!channelId) {
              throw new Error(
                `Channel "${channelName}" (primary: "${primaryChannelName}") in mode "${oflMode.name}" not found in availableChannels`,
              );
            }

            await tx.modeChannel.create({
              data: {
                modeId: mode.id,
                channelId,
                offset: i,
              },
            });
          }
        }

        return {
          id: fixtureDefinition.id,
          manufacturer: fixtureDefinition.manufacturer,
          model: fixtureDefinition.model,
          type: fixtureDefinition.type as FixtureType,
        };
      },
      {
        timeout: 30000, // 30 second timeout for complex fixtures
      },
    );
  }

  /**
   * Validate that the OFL fixture has required fields
   */
  private validateOFLFixture(fixture: unknown): asserts fixture is OFLFixture {
    if (!fixture || typeof fixture !== "object") {
      throw new Error("OFL fixture must be an object");
    }

    const f = fixture as Record<string, unknown>;

    if (!f.name || typeof f.name !== "string") {
      throw new Error('OFL fixture must have a "name" field');
    }

    if (!Array.isArray(f.categories) || f.categories.length === 0) {
      throw new Error(
        'OFL fixture must have a "categories" array with at least one category',
      );
    }

    if (
      !f.availableChannels ||
      typeof f.availableChannels !== "object" ||
      Object.keys(f.availableChannels).length === 0
    ) {
      throw new Error(
        'OFL fixture must have "availableChannels" with at least one channel',
      );
    }

    if (!Array.isArray(f.modes) || f.modes.length === 0) {
      throw new Error('OFL fixture must have a "modes" array with at least one mode');
    }
  }

  /**
   * Process OFL channels into our channel definition format
   * This also creates fine channel aliases as separate channels
   */
  private processChannels(availableChannels: {
    [key: string]: OFLChannel;
  }): Array<{
    name: string;
    type: ChannelType;
    offset: number;
    minValue: number;
    maxValue: number;
    defaultValue: number;
  }> {
    const channels: Array<{
      name: string;
      type: ChannelType;
      offset: number;
      minValue: number;
      maxValue: number;
      defaultValue: number;
    }> = [];

    let offset = 0;
    for (const [channelName, channelData] of Object.entries(
      availableChannels,
    )) {
      // Get the first capability to determine channel type and values
      const capability =
        channelData.capability ||
        (channelData.capabilities && channelData.capabilities[0]);

      if (!capability) {
        // Default channel if no capability info
        channels.push({
          name: channelName,
          type: ChannelType.OTHER,
          offset: offset++,
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        });
        continue;
      }

      const channelType = this.mapChannelType(capability);
      const { min, max } = this.getMinMaxValues(capability);
      const defaultValue = this.getDefaultValue(capability);

      // Add the main channel
      channels.push({
        name: channelName,
        type: channelType,
        offset: offset++,
        minValue: min,
        maxValue: max,
        defaultValue,
      });

      // Add fine channel aliases if they exist
      if (channelData.fineChannelAliases) {
        for (const fineAlias of channelData.fineChannelAliases) {
          channels.push({
            name: fineAlias,
            type: channelType, // Same type as parent channel
            offset: offset++,
            minValue: 0,
            maxValue: 255,
            defaultValue: 0,
          });
        }
      }
    }

    return channels;
  }

  /**
   * Map OFL capability type to our ChannelType enum
   */
  mapChannelType(capability: OFLCapability): ChannelType {
    const type = capability.type;

    if (type === "Intensity") {
      return ChannelType.INTENSITY;
    }

    if (type === "ColorIntensity" && capability.color) {
      const color = capability.color.toLowerCase();
      if (color === "red") {return ChannelType.RED;}
      if (color === "green") {return ChannelType.GREEN;}
      if (color === "blue") {return ChannelType.BLUE;}
      if (color === "white") {return ChannelType.WHITE;}
      if (color === "amber") {return ChannelType.AMBER;}
      if (color === "uv") {return ChannelType.UV;}
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

  /**
   * Map OFL categories to our FixtureType enum
   */
  mapFixtureType(categories: string[]): FixtureType {
    const categoriesLower = categories.map((c) => c.toLowerCase());

    if (
      categoriesLower.some(
        (c) => c.includes("moving head") || c.includes("scanner"),
      )
    ) {
      return FixtureType.MOVING_HEAD;
    }

    if (categoriesLower.some((c) => c.includes("strobe") || c.includes("blinder"))) {
      return FixtureType.STROBE;
    }

    if (categoriesLower.some((c) => c.includes("dimmer"))) {
      return FixtureType.DIMMER;
    }

    if (
      categoriesLower.some(
        (c) =>
          c.includes("color changer") || c.includes("par") || c.includes("wash"),
      )
    ) {
      return FixtureType.LED_PAR;
    }

    return FixtureType.OTHER;
  }

  /**
   * Get min/max DMX values from OFL capability
   */
  getMinMaxValues(capability: OFLCapability): { min: number; max: number } {
    if (capability.dmxRange) {
      return { min: capability.dmxRange[0], max: capability.dmxRange[1] };
    }
    return { min: 0, max: 255 };
  }

  /**
   * Get default DMX value from OFL capability
   */
  getDefaultValue(capability: OFLCapability): number {
    // For intensity channels, default to 0 (off)
    if (
      capability.type === "Intensity" ||
      capability.type === "ColorIntensity"
    ) {
      return 0;
    }

    // For position channels (pan/tilt), default to center
    if (capability.type === "Pan" || capability.type === "Tilt") {
      if (capability.dmxRange) {
        const [min, max] = capability.dmxRange;
        return Math.floor((min + max) / 2);
      }
      return 127; // Center of 0-255
    }

    // For other channels, use the minimum value if available
    if (capability.dmxRange) {
      return capability.dmxRange[0];
    }

    return 0;
  }
}
