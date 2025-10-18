#!/usr/bin/env tsx

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

const EXPORT_DIR = '/tmp/pg_export_json';
const TABLES = [
  'projects',
  'users',
  'project_users',
  'fixture_definitions',
  'channel_definitions',
  'fixture_modes',
  'mode_channels',
  'fixture_instances',
  'instance_channels',
  'scenes',
  'fixture_values',
  'cue_lists',
  'cues',
  'preview_sessions',
  'settings',
];

async function main() {
  console.log('Creating export directory...');
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  for (const table of TABLES) {
    console.log(`Exporting ${table}...`);

    const cmd = `docker exec lacylights-postgres psql -U lacylights -d lacylights -t -A -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM ${table}) t"`;

    try {
      const { stdout } = await execAsync(cmd);
      const data = stdout.trim() || 'null';
      fs.writeFileSync(path.join(EXPORT_DIR, `${table}.json`), data);
      console.log(`  ✓ ${table}`);
    } catch (error: any) {
      console.error(`  ✗ ${table}: ${error.message}`);
    }
  }

  console.log(`\nExport complete: ${EXPORT_DIR}`);
}

main().catch(console.error);
