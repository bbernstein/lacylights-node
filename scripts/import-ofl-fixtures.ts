import fs from 'fs';
import path from 'path';
import { PrismaClient, FixtureType, ChannelType } from '@prisma/client';

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

// Map OFL channel types to our ChannelType enum
function mapChannelType(oflCapability: OFLCapability): ChannelType {
  const type = oflCapability.type;
  const color = oflCapability.color?.toLowerCase();

  if (type === 'Intensity') return ChannelType.INTENSITY;
  if (type === 'ColorIntensity') {
    switch (color) {
      case 'red': return ChannelType.RED;
      case 'green': return ChannelType.GREEN;
      case 'blue': return ChannelType.BLUE;
      case 'white': return ChannelType.WHITE;
      case 'amber': return ChannelType.AMBER;
      case 'uv': return ChannelType.UV;
      default: return ChannelType.OTHER;
    }
  }
  if (type === 'Pan') return ChannelType.PAN;
  if (type === 'Tilt') return ChannelType.TILT;
  if (type === 'Zoom') return ChannelType.ZOOM;
  if (type === 'Focus') return ChannelType.FOCUS;
  if (type === 'Iris') return ChannelType.IRIS;
  if (type === 'Gobo') return ChannelType.GOBO;
  if (type === 'ColorWheel') return ChannelType.COLOR_WHEEL;
  if (type === 'Effect') return ChannelType.EFFECT;
  if (type === 'ShutterStrobe') return ChannelType.STROBE;
  if (type === 'Maintenance') return ChannelType.MACRO;
  
  return ChannelType.OTHER;
}

// Map OFL categories to our FixtureType enum
function mapFixtureType(categories: string[]): FixtureType {
  const categoryString = categories.join(' ').toLowerCase();
  
  if (categoryString.includes('moving head') || categoryString.includes('scanner')) {
    return FixtureType.MOVING_HEAD;
  }
  if (categoryString.includes('strobe') || categoryString.includes('blinder')) {
    return FixtureType.STROBE;
  }
  if (categoryString.includes('dimmer')) {
    return FixtureType.DIMMER;
  }
  if (categoryString.includes('color changer') || categoryString.includes('par') || categoryString.includes('wash')) {
    return FixtureType.LED_PAR;
  }
  
  return FixtureType.OTHER;
}

// Get default value for a capability
function getDefaultValue(capability: OFLCapability): number {
  if (capability.dmxRange) {
    return capability.dmxRange[0];
  }
  if (capability.type === 'Intensity' || capability.type === 'ColorIntensity') {
    return 0; // Start at 0 for intensity channels
  }
  return 128; // Middle value for other channels
}

// Get min/max values for a capability
function getMinMaxValues(capability: OFLCapability): { min: number; max: number } {
  if (capability.dmxRange) {
    return { min: capability.dmxRange[0], max: capability.dmxRange[1] };
  }
  return { min: 0, max: 255 };
}

async function importOFLFixtures() {
  const oflPath = path.join(process.cwd(), 'temp-ofl');
  const fixturesPath = path.join(oflPath, 'fixtures');
  const manufacturersPath = path.join(fixturesPath, 'manufacturers.json');

  // Load manufacturers
  const manufacturersData: OFLManufacturers = JSON.parse(
    fs.readFileSync(manufacturersPath, 'utf8')
  );

  console.log('Starting OFL fixture import...');
  let totalFixtures = 0;
  let successfulImports = 0;
  let errors = 0;

  // Process each manufacturer directory
  for (const manufacturerKey of Object.keys(manufacturersData)) {
    const manufacturerPath = path.join(fixturesPath, manufacturerKey);
    
    if (!fs.existsSync(manufacturerPath) || !fs.statSync(manufacturerPath).isDirectory()) {
      continue;
    }

    const manufacturerName = manufacturersData[manufacturerKey].name;
    console.log(`Processing manufacturer: ${manufacturerName}`);

    // Get all fixture files for this manufacturer
    const fixtureFiles = fs.readdirSync(manufacturerPath)
      .filter(file => file.endsWith('.json'));

    for (const fixtureFile of fixtureFiles) {
      totalFixtures++;
      const fixturePath = path.join(manufacturerPath, fixtureFile);
      
      try {
        const oflFixture: OFLFixture = JSON.parse(
          fs.readFileSync(fixturePath, 'utf8')
        );

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
          console.log(`  Skipping existing fixture: ${oflFixture.name}`);
          continue;
        }

        // Skip fixtures without modes
        if (!oflFixture.modes || oflFixture.modes.length === 0) {
          console.log(`  Skipping fixture without modes: ${oflFixture.name}`);
          continue;
        }

        // Get all unique channels from all modes (not just the longest mode)
        const allChannelNames = new Set<string>();
        oflFixture.modes.forEach(mode => {
          mode.channels.forEach(channelName => allChannelNames.add(channelName));
        });

        // Create channel definitions for all unique channels
        const channelDefinitions = Array.from(allChannelNames).map((channelName, index) => {
          const oflChannel = oflFixture.availableChannels[channelName];
          
          // Use the first capability or the single capability
          const capability = oflChannel.capabilities 
            ? oflChannel.capabilities[0] 
            : oflChannel.capability;

          if (!capability) {
            throw new Error(`No capability found for channel: ${channelName}`);
          }

          const { min, max } = getMinMaxValues(capability);
          
          return {
            name: channelName,
            type: mapChannelType(capability),
            offset: index + 1, // Just for ordering, actual offset is in modes
            minValue: min,
            maxValue: max,
            defaultValue: getDefaultValue(capability),
          };
        });

        // Create the fixture definition with channels first
        const fixtureDefinition = await prisma.fixtureDefinition.create({
          data: {
            manufacturer: manufacturerName,
            model: oflFixture.name,
            type: mapFixtureType(oflFixture.categories),
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
                  // Find the channel definition by name
                  const channelDef = fixtureDefinition.channels.find(
                    ch => ch.name === channelName
                  );
                  if (!channelDef) {
                    throw new Error(`Channel ${channelName} not found for mode ${oflMode.name}`);
                  }
                  return {
                    offset: offset + 1, // DMX channels are 1-indexed
                    channelId: channelDef.id,
                  };
                }),
              },
            },
          });
        }

        console.log(`  ✓ Imported: ${oflFixture.name} (${channelDefinitions.length} channels)`);
        successfulImports++;

      } catch (error) {
        console.error(`  ✗ Error importing ${fixtureFile}:`, error);
        errors++;
      }
    }
  }

  console.log('\nImport Summary:');
  console.log(`Total fixtures processed: ${totalFixtures}`);
  console.log(`Successful imports: ${successfulImports}`);
  console.log(`Errors: ${errors}`);
  console.log(`Skipped (already exist): ${totalFixtures - successfulImports - errors}`);
}

async function main() {
  try {
    await importOFLFixtures();
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { importOFLFixtures };