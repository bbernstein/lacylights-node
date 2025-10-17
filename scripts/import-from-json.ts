#!/usr/bin/env tsx

/**
 * Import data from JSON files into SQLite database
 * This script is used during PostgreSQL to SQLite migration
 *
 * Usage: npx tsx scripts/import-from-json.ts <export_dir>
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ImportStats {
  table: string;
  imported: number;
  skipped: number;
  errors: number;
}

async function importTable(tableName: string, filePath: string): Promise<ImportStats> {
  const stats: ImportStats = {
    table: tableName,
    imported: 0,
    skipped: 0,
    errors: 0,
  };

  console.log(`\nImporting ${tableName}...`);

  // Read JSON file
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  let records: any[];

  try {
    const parsed = JSON.parse(fileContent);
    records = parsed === null ? [] : (Array.isArray(parsed) ? parsed : [parsed]);
  } catch (error) {
    console.error(`✗ Failed to parse ${filePath}:`, error);
    return stats;
  }

  if (records.length === 0) {
    console.log(`  No records to import`);
    return stats;
  }

  console.log(`  Found ${records.length} records`);

  // Get the Prisma model
  const model = (prisma as any)[tableName];
  if (!model) {
    console.error(`✗ Prisma model '${tableName}' not found`);
    stats.errors = records.length;
    return stats;
  }

  // Helper function to convert snake_case to camelCase
  const snakeToCamel = (str: string) =>
    str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

  // Import records
  for (const record of records) {
    try {
      // Convert snake_case keys to camelCase
      const camelRecord: any = {};
      for (const [key, value] of Object.entries(record)) {
        const camelKey = snakeToCamel(key);
        // Convert timestamp strings to Date objects
        if (
          (camelKey === 'createdAt' || camelKey === 'updatedAt' || camelKey === 'joinedAt') &&
          value
        ) {
          camelRecord[camelKey] = new Date(value as string);
        } else {
          camelRecord[camelKey] = value;
        }
      }

      // Check if record already exists
      const existing = await model.findUnique({
        where: { id: camelRecord.id },
      });

      if (existing) {
        stats.skipped++;
      } else {
        await model.create({ data: camelRecord });
        stats.imported++;
      }
    } catch (error: any) {
      console.error(`  ✗ Error importing record ${record.id}:`, error.message);
      stats.errors++;
    }
  }

  console.log(`  ✓ Imported: ${stats.imported}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  return stats;
}

async function main() {
  const exportDir = process.argv[2];

  if (!exportDir) {
    console.error('Usage: npx tsx scripts/import-from-json.ts <export_dir>');
    process.exit(1);
  }

  if (!fs.existsSync(exportDir)) {
    console.error(`Error: Directory ${exportDir} does not exist`);
    process.exit(1);
  }

  console.log('========================================');
  console.log('SQLite Data Import');
  console.log('========================================');
  console.log(`Source: ${exportDir}`);
  console.log(`Target: ${process.env.DATABASE_URL}`);
  console.log('========================================');

  const allStats: ImportStats[] = [];

  // Import in dependency order (Prisma model names are PascalCase and singular)
  const importOrder = [
    { model: 'project', file: 'projects' },
    { model: 'user', file: 'users' },
    { model: 'projectUser', file: 'project_users' },
    { model: 'fixtureDefinition', file: 'fixture_definitions' },
    { model: 'channelDefinition', file: 'channel_definitions' },
    { model: 'fixtureMode', file: 'fixture_modes' },
    { model: 'modeChannel', file: 'mode_channels' },
    { model: 'fixtureInstance', file: 'fixture_instances' },
    { model: 'instanceChannel', file: 'instance_channels' },
    { model: 'scene', file: 'scenes' },
    { model: 'fixtureValue', file: 'fixture_values' },
    { model: 'cueList', file: 'cue_lists' },
    { model: 'cue', file: 'cues' },
    { model: 'previewSession', file: 'preview_sessions' },
    { model: 'setting', file: 'settings' },
  ];

  for (const { model, file } of importOrder) {
    const filePath = path.join(exportDir, `${file}.json`);

    if (fs.existsSync(filePath)) {
      const stats = await importTable(model, filePath);
      allStats.push(stats);
    } else {
      console.log(`\nSkipping ${model} (file not found: ${filePath})`);
    }
  }

  // Print summary
  console.log('\n========================================');
  console.log('Import Summary');
  console.log('========================================');

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const stats of allStats) {
    console.log(`${stats.table.padEnd(25)} ${stats.imported.toString().padStart(6)} imported, ${stats.skipped.toString().padStart(6)} skipped, ${stats.errors.toString().padStart(6)} errors`);
    totalImported += stats.imported;
    totalSkipped += stats.skipped;
    totalErrors += stats.errors;
  }

  console.log('----------------------------------------');
  console.log(`${'TOTAL'.padEnd(25)} ${totalImported.toString().padStart(6)} imported, ${totalSkipped.toString().padStart(6)} skipped, ${totalErrors.toString().padStart(6)} errors`);
  console.log('========================================');

  if (totalErrors > 0) {
    console.error('\n⚠️  Import completed with errors');
    process.exit(1);
  } else {
    console.log('\n✓ Import completed successfully!');
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
