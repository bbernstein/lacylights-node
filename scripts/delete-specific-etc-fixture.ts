#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteSpecificETCFixture() {
  const fixtureId = 'cmfe531v3000n5l24k44lofuw';
  
  console.log(`🔍 Looking for fixture definition with ID: ${fixtureId}`);

  // Find the specific fixture definition by ID
  const fixtureDefinition = await prisma.fixtureDefinition.findUnique({
    where: {
      id: fixtureId,
    },
    include: {
      instances: {
        include: {
          project: true,
        },
      },
    },
  });

  if (!fixtureDefinition) {
    console.log(`❌ No fixture definition found with ID: ${fixtureId}`);
    return;
  }

  console.log(`📋 Found fixture definition:`);
  console.log(`   ID: ${fixtureDefinition.id}`);
  console.log(`   Manufacturer: ${fixtureDefinition.manufacturer}`);
  console.log(`   Model: ${fixtureDefinition.model}`);
  console.log(`   Type: ${fixtureDefinition.type}`);
  console.log(`   Is Built-in: ${fixtureDefinition.isBuiltIn}`);
  console.log(`   Instances: ${fixtureDefinition.instances.length}`);

  // Verify this is the correct fixture to delete
  if (fixtureDefinition.manufacturer !== 'ETC' || 
      fixtureDefinition.model !== 'ColorSource PAR' || 
      fixtureDefinition.type !== 'OTHER') {
    console.log(`❌ Safety check failed! This fixture doesn't match the expected criteria:`);
    console.log(`   Expected: ETC ColorSource PAR (type: OTHER)`);
    console.log(`   Found: ${fixtureDefinition.manufacturer} ${fixtureDefinition.model} (type: ${fixtureDefinition.type})`);
    return;
  }

  // Show other ETC ColorSource PAR fixtures that will be preserved
  console.log(`\n🔍 Checking for other ETC ColorSource PAR fixtures...`);
  const otherETCFixtures = await prisma.fixtureDefinition.findMany({
    where: {
      manufacturer: {
        in: ['ETC', 'Etc'], // Check both capitalizations
      },
      model: 'ColorSource PAR',
      id: {
        not: fixtureId, // Exclude the one we're deleting
      },
    },
  });

  if (otherETCFixtures.length > 0) {
    console.log(`✅ Found ${otherETCFixtures.length} other ETC ColorSource PAR fixture(s) that will be preserved:`);
    otherETCFixtures.forEach((fixture, index) => {
      console.log(`   ${index + 1}. ${fixture.manufacturer} ${fixture.model} (type: ${fixture.type}, ID: ${fixture.id})`);
    });
  } else {
    console.log(`⚠️  No other ETC ColorSource PAR fixtures found in database`);
  }

  if (fixtureDefinition.instances.length > 0) {
    console.log(`\n📋 Fixture instances that will be deleted:`);
    fixtureDefinition.instances.forEach((instance, index) => {
      console.log(`   ${index + 1}. ${instance.name} (Project: ${instance.project.name})`);
    });
  }

  try {
    // First, delete all fixture instances
    if (fixtureDefinition.instances.length > 0) {
      console.log(`\n🗑️  Deleting ${fixtureDefinition.instances.length} fixture instances...`);
      
      for (const instance of fixtureDefinition.instances) {
        // Delete fixture values first (scenes that reference these fixtures)
        await prisma.fixtureValue.deleteMany({
          where: {
            fixtureId: instance.id,
          },
        });
        
        // Delete the fixture instance channels
        await prisma.instanceChannel.deleteMany({
          where: {
            fixtureId: instance.id,
          },
        });
        
        // Delete the fixture instance
        await prisma.fixtureInstance.delete({
          where: {
            id: instance.id,
          },
        });
        
        console.log(`   ✅ Deleted fixture instance: ${instance.name}`);
      }
    }

    // Now delete the fixture definition
    console.log(`\n🗑️  Deleting fixture definition...`);
    await prisma.fixtureDefinition.delete({
      where: {
        id: fixtureDefinition.id,
      },
    });

    console.log(`✅ Successfully deleted fixture definition: ${fixtureDefinition.manufacturer} ${fixtureDefinition.model} (type: ${fixtureDefinition.type})`);
    console.log(`✅ Total deleted: ${fixtureDefinition.instances.length} instances + 1 definition`);

    // Confirm the good fixture still exists
    if (otherETCFixtures.length > 0) {
      console.log(`\n✅ Preserved ETC ColorSource PAR fixtures are still in database`);
    }

  } catch (error) {
    console.error(`❌ Error during deletion: ${error}`);
  }
}

async function main() {
  try {
    await deleteSpecificETCFixture();
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