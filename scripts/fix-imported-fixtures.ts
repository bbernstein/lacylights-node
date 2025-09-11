#!/usr/bin/env tsx

import { PrismaClient, ChannelType } from '@prisma/client';

const prisma = new PrismaClient();

async function fixImportedFixtures() {
  console.log('🔍 Finding fixtures without channel records...');

  // Find all fixtures that don't have any channel records
  const fixturesWithoutChannels = await prisma.fixtureInstance.findMany({
    where: {
      channels: {
        none: {},
      },
    },
    include: {
      definition: {
        include: {
          channels: true,
          modes: {
            include: {
              modeChannels: {
                include: { channel: true },
                orderBy: { offset: 'asc' },
              },
            },
          },
        },
      },
    },
  });

  console.log(`📋 Found ${fixturesWithoutChannels.length} fixtures without channels`);

  if (fixturesWithoutChannels.length === 0) {
    console.log('✅ All fixtures already have channels');
    return;
  }

  let fixedCount = 0;

  for (const fixture of fixturesWithoutChannels) {
    try {
      console.log(`🔧 Fixing fixture: ${fixture.name} (${fixture.manufacturer} ${fixture.model})`);

      let channelsToCreate: Array<{
        offset: number;
        name: string;
        type: ChannelType;
        minValue: number;
        maxValue: number;
        defaultValue: number;
      }> = [];

      // Try to find the matching mode for this fixture
      const matchingMode = fixture.definition?.modes?.find(m => 
        m.name === fixture.modeName && m.channelCount === fixture.channelCount
      );

      if (matchingMode?.modeChannels?.length > 0) {
        // Use mode channels
        channelsToCreate = matchingMode.modeChannels.map((mc: any) => ({
          offset: mc.offset,
          name: mc.channel.name,
          type: mc.channel.type,
          minValue: mc.channel.minValue,
          maxValue: mc.channel.maxValue,
          defaultValue: mc.channel.defaultValue,
        }));
      } else if (fixture.definition?.channels?.length > 0) {
        // Use definition channels, limited to the fixture's channel count
        channelsToCreate = fixture.definition.channels
          .sort((a: any, b: any) => a.offset - b.offset)
          .slice(0, fixture.channelCount)
          .map((ch: any) => ({
            offset: ch.offset,
            name: ch.name,
            type: ch.type,
            minValue: ch.minValue,
            maxValue: ch.maxValue,
            defaultValue: ch.defaultValue,
          }));
      } else {
        // Create generic channels as fallback
        for (let i = 0; i < fixture.channelCount; i++) {
          channelsToCreate.push({
            offset: i,
            name: `Channel ${i + 1}`,
            type: i === 0 ? 'INTENSITY' : 'OTHER',
            minValue: 0,
            maxValue: 255,
            defaultValue: 0,
          });
        }
      }

      // Create the channel instances
      await prisma.fixtureInstance.update({
        where: { id: fixture.id },
        data: {
          channels: {
            create: channelsToCreate,
          },
        },
      });

      console.log(`  ✅ Created ${channelsToCreate.length} channels for ${fixture.name}`);
      fixedCount++;

    } catch (error) {
      console.error(`  ❌ Error fixing fixture ${fixture.name}: ${error}`);
    }
  }

  console.log(`\n🎉 Fixed ${fixedCount} out of ${fixturesWithoutChannels.length} fixtures`);
}

async function main() {
  try {
    await fixImportedFixtures();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}