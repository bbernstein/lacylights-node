#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteFixtureDefinition() {
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
      _count: {
        select: {
          instances: true,
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
  console.log(`   Instances using this definition: ${fixtureDefinition._count.instances}`);

  if (fixtureDefinition._count.instances > 0) {
    console.log(`⚠️  WARNING: This fixture definition is being used by ${fixtureDefinition._count.instances} fixture instances.`);
    console.log(`   Deleting this definition will also delete those instances.`);
    console.log(`   You may want to reassign those instances to a different definition first.`);
  }

  try {
    // Delete the fixture definition (this will cascade and delete related instances)
    await prisma.fixtureDefinition.delete({
      where: {
        id: fixtureDefinition.id,
      },
    });

    console.log(`✅ Successfully deleted fixture definition: ${manufacturer} ${model}`);
    
    if (fixtureDefinition._count.instances > 0) {
      console.log(`   Also deleted ${fixtureDefinition._count.instances} fixture instances that were using this definition.`);
    }

  } catch (error) {
    console.error(`❌ Error deleting fixture definition: ${error}`);
  }
}

async function main() {
  try {
    await deleteFixtureDefinition();
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