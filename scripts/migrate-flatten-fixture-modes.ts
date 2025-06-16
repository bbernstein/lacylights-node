import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateFixtureModes() {
  console.log('Starting fixture mode flattening migration...');

  try {
    // First, fetch all existing fixture instances with their related data
    const fixtures = await prisma.fixtureInstance.findMany({
      include: {
        definition: {
          include: {
            channels: true,
          },
        },
        mode: {
          include: {
            modeChannels: {
              include: {
                channel: true,
              },
              orderBy: {
                offset: 'asc',
              },
            },
          },
        },
      },
    });

    console.log(`Found ${fixtures.length} fixtures to migrate`);

    // Process each fixture
    for (const fixture of fixtures) {
      console.log(`Processing fixture: ${fixture.name} (${fixture.id})`);

      // Determine which channels to use
      let channelsToCreate: Array<{
        offset: number;
        name: string;
        type: string;
        minValue: number;
        maxValue: number;
        defaultValue: number;
      }> = [];

      if (fixture.mode && fixture.mode.modeChannels.length > 0) {
        // Use mode channels
        console.log(`  Using mode channels from mode: ${fixture.mode.name}`);
        channelsToCreate = fixture.mode.modeChannels.map((mc) => ({
          offset: mc.offset,
          name: mc.channel.name,
          type: mc.channel.type,
          minValue: mc.channel.minValue,
          maxValue: mc.channel.maxValue,
          defaultValue: mc.channel.defaultValue,
        }));
      } else {
        // Use definition channels
        console.log('  Using definition channels (no mode selected)');
        channelsToCreate = fixture.definition.channels
          .sort((a, b) => a.offset - b.offset)
          .map((ch) => ({
            offset: ch.offset,
            name: ch.name,
            type: ch.type,
            minValue: ch.minValue,
            maxValue: ch.maxValue,
            defaultValue: ch.defaultValue,
          }));
      }

      // Update fixture instance with flattened data
      await prisma.fixtureInstance.update({
        where: { id: fixture.id },
        data: {
          manufacturer: fixture.definition.manufacturer,
          model: fixture.definition.model,
          type: fixture.definition.type,
          modeName: fixture.mode?.name || 'Default',
          channelCount: fixture.mode?.channelCount || fixture.definition.channels.length,
        },
      });
      console.log(`  Updated fixture metadata`);

      // Create instance channels
      for (const channel of channelsToCreate) {
        await prisma.instanceChannel.create({
          data: {
            fixtureId: fixture.id,
            offset: channel.offset,
            name: channel.name,
            type: channel.type as any,
            minValue: channel.minValue,
            maxValue: channel.maxValue,
            defaultValue: channel.defaultValue,
          },
        });
      }
      console.log(`  Created ${channelsToCreate.length} instance channels`);
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateFixtureModes().catch((error) => {
  console.error('Fatal error during migration:', error);
  process.exit(1);
});