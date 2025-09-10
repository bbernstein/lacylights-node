#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteFixtureAndInstances() {
  const manufacturer = 'Chauvet';
  const model = 'SlimPAR Pro Q USB';
  
  console.log(`🔍 Looking for fixture definition: ${manufacturer} ${model}`);

  // Find the fixture definition
  const fixtureDefinition = await prisma.fixtureDefinition.findFirst({
    where: {
      manufacturer: manufacturer,
      model: model,
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
    console.log(`❌ No fixture definition found for ${manufacturer} ${model}`);
    return;
  }

  console.log(`📋 Found fixture definition:`);
  console.log(`   ID: ${fixtureDefinition.id}`);
  console.log(`   Manufacturer: ${fixtureDefinition.manufacturer}`);
  console.log(`   Model: ${fixtureDefinition.model}`);
  console.log(`   Type: ${fixtureDefinition.type}`);
  console.log(`   Is Built-in: ${fixtureDefinition.isBuiltIn}`);
  console.log(`   Instances: ${fixtureDefinition.instances.length}`);

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

    console.log(`✅ Successfully deleted fixture definition: ${manufacturer} ${model}`);
    console.log(`✅ Total deleted: ${fixtureDefinition.instances.length} instances + 1 definition`);

  } catch (error) {
    console.error(`❌ Error during deletion: ${error}`);
  }
}

async function main() {
  try {
    await deleteFixtureAndInstances();
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