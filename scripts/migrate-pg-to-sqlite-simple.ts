#!/usr/bin/env tsx

/**
 * Simple PostgreSQL to SQLite Migration
 * Exports all data from PostgreSQL and imports into SQLite
 */

import { PrismaClient } from '@prisma/client';

const POSTGRES_URL = process.env.POSTGRES_URL || "postgresql://lacylights:lacylights_dev_password@localhost:5432/lacylights";
const SQLITE_URL = process.env.SQLITE_URL || "file:/var/lib/lacylights/db.sqlite";

async function exportFromPostgres() {
  console.log('Connecting to PostgreSQL...');
  const pgPrisma = new PrismaClient({
    datasources: { db: { url: POSTGRES_URL } },
  });

  try {
    console.log('Exporting data from PostgreSQL...\n');

    const data = {
      projects: await pgPrisma.project.findMany(),
      fixtureDefinitions: await pgPrisma.fixtureDefinition.findMany({ orderBy: { createdAt: 'asc' } }),
      channelDefinitions: await pgPrisma.channelDefinition.findMany({ orderBy: [{ definitionId: 'asc' }, { offset: 'asc' }] }),
      fixtureModes: await pgPrisma.fixtureMode.findMany({ orderBy: [{ definitionId: 'asc' }, { name: 'asc' }] }),
      modeChannels: await pgPrisma.modeChannel.findMany({ orderBy: [{ modeId: 'asc' }, { offset: 'asc' }] }),
      fixtureInstances: await pgPrisma.fixtureInstance.findMany({ orderBy: [{ projectId: 'asc' }, { universe: 'asc' }, { startChannel: 'asc' }] }),
      instanceChannels: await pgPrisma.instanceChannel.findMany({ orderBy: [{ fixtureId: 'asc' }, { offset: 'asc' }] }),
      scenes: await pgPrisma.scene.findMany({ orderBy: [{ projectId: 'asc' }, { createdAt: 'asc' }] }),
      fixtureValues: await pgPrisma.fixtureValue.findMany({ orderBy: [{ sceneId: 'asc' }, { sceneOrder: 'asc' }] }),
      cueLists: await pgPrisma.cueList.findMany({ orderBy: [{ projectId: 'asc' }, { createdAt: 'asc' }] }),
      cues: await pgPrisma.cue.findMany({ orderBy: [{ cueListId: 'asc' }, { cueNumber: 'asc' }] }),
      settings: await pgPrisma.setting.findMany(),
    };

    console.log('Export summary:');
    console.log(`  Projects: ${data.projects.length}`);
    console.log(`  Fixture Definitions: ${data.fixtureDefinitions.length}`);
    console.log(`  Channel Definitions: ${data.channelDefinitions.length}`);
    console.log(`  Fixture Modes: ${data.fixtureModes.length}`);
    console.log(`  Mode Channels: ${data.modeChannels.length}`);
    console.log(`  Fixture Instances: ${data.fixtureInstances.length}`);
    console.log(`  Instance Channels: ${data.instanceChannels.length}`);
    console.log(`  Scenes: ${data.scenes.length}`);
    console.log(`  Fixture Values: ${data.fixtureValues.length}`);
    console.log(`  Cue Lists: ${data.cueLists.length}`);
    console.log(`  Cues: ${data.cues.length}`);
    console.log(`  Settings: ${data.settings.length}`);

    return data;
  } finally {
    await pgPrisma.$disconnect();
  }
}

async function importToSQLite(data: any) {
  console.log('\nConnecting to SQLite...');
  const sqlitePrisma = new PrismaClient({
    datasources: { db: { url: SQLITE_URL } },
  });

  try {
    console.log('Importing data into SQLite...\n');

    // Import in dependency order
    let imported = 0;

    console.log('Importing projects...');
    for (const project of data.projects) {
      await sqlitePrisma.project.create({ data: project });
      imported++;
    }
    console.log(`  ✓ ${data.projects.length} projects`);

    console.log('Importing fixture definitions...');
    for (const def of data.fixtureDefinitions) {
      await sqlitePrisma.fixtureDefinition.create({ data: def });
      imported++;
    }
    console.log(`  ✓ ${data.fixtureDefinitions.length} fixture definitions`);

    console.log('Importing channel definitions...');
    for (const channel of data.channelDefinitions) {
      await sqlitePrisma.channelDefinition.create({ data: channel });
      imported++;
    }
    console.log(`  ✓ ${data.channelDefinitions.length} channel definitions`);

    console.log('Importing fixture modes...');
    for (const mode of data.fixtureModes) {
      await sqlitePrisma.fixtureMode.create({ data: mode });
      imported++;
    }
    console.log(`  ✓ ${data.fixtureModes.length} fixture modes`);

    console.log('Importing mode channels...');
    for (const modeChannel of data.modeChannels) {
      await sqlitePrisma.modeChannel.create({ data: modeChannel });
      imported++;
    }
    console.log(`  ✓ ${data.modeChannels.length} mode channels`);

    console.log('Importing fixture instances...');
    for (const instance of data.fixtureInstances) {
      await sqlitePrisma.fixtureInstance.create({ data: instance });
      imported++;
    }
    console.log(`  ✓ ${data.fixtureInstances.length} fixture instances`);

    console.log('Importing instance channels...');
    for (const channel of data.instanceChannels) {
      await sqlitePrisma.instanceChannel.create({ data: channel });
      imported++;
    }
    console.log(`  ✓ ${data.instanceChannels.length} instance channels`);

    console.log('Importing scenes...');
    for (const scene of data.scenes) {
      await sqlitePrisma.scene.create({ data: scene });
      imported++;
    }
    console.log(`  ✓ ${data.scenes.length} scenes`);

    console.log('Importing fixture values...');
    for (const value of data.fixtureValues) {
      await sqlitePrisma.fixtureValue.create({ data: value });
      imported++;
    }
    console.log(`  ✓ ${data.fixtureValues.length} fixture values`);

    console.log('Importing cue lists...');
    for (const cueList of data.cueLists) {
      await sqlitePrisma.cueList.create({ data: cueList });
      imported++;
    }
    console.log(`  ✓ ${data.cueLists.length} cue lists`);

    console.log('Importing cues...');
    for (const cue of data.cues) {
      await sqlitePrisma.cue.create({ data: cue });
      imported++;
    }
    console.log(`  ✓ ${data.cues.length} cues`);

    console.log('Importing settings...');
    for (const setting of data.settings) {
      await sqlitePrisma.setting.create({ data: setting });
      imported++;
    }
    console.log(`  ✓ ${data.settings.length} settings`);

    console.log(`\n✓ Total records imported: ${imported}`);
  } finally {
    await sqlitePrisma.$disconnect();
  }
}

async function main() {
  console.log('========================================');
  console.log('PostgreSQL to SQLite Migration');
  console.log('========================================');
  console.log(`Source: ${POSTGRES_URL}`);
  console.log(`Target: ${SQLITE_URL}`);
  console.log('========================================\n');

  const data = await exportFromPostgres();
  await importToSQLite(data);

  console.log('\n========================================');
  console.log('Migration completed successfully!');
  console.log('========================================');
}

main().catch((error) => {
  console.error('\n✗ Migration failed:', error);
  process.exit(1);
});
