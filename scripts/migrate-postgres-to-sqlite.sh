#!/bin/bash

# PostgreSQL to SQLite Migration Script for LacyLights
# This script migrates data from PostgreSQL to SQLite on a Raspberry Pi

set -e  # Exit on any error

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-lacylights}"
POSTGRES_USER="${POSTGRES_USER:-lacylights}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-lacylights_dev_password}"
SQLITE_PATH="${SQLITE_PATH:-/var/lib/lacylights/db.sqlite}"
BACKUP_DIR="/var/lib/lacylights/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=========================================="
echo "PostgreSQL to SQLite Migration"
echo "=========================================="
echo "Source: PostgreSQL at $POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_DB"
echo "Target: SQLite at $SQLITE_PATH"
echo "Backup: $BACKUP_DIR/postgres_backup_$TIMESTAMP.sql"
echo "=========================================="
echo ""

# Create directories if they don't exist
echo "Creating directories..."
sudo mkdir -p /var/lib/lacylights/backups
sudo mkdir -p "$(dirname "$SQLITE_PATH")"
sudo chown -R "$USER:$USER" /var/lib/lacylights

# Backup PostgreSQL database
echo ""
echo "Step 1: Backing up PostgreSQL database..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -F p \
  -f "$BACKUP_DIR/postgres_backup_$TIMESTAMP.sql"

echo "✓ PostgreSQL backup saved to: $BACKUP_DIR/postgres_backup_$TIMESTAMP.sql"

# Export data to JSON for migration
echo ""
echo "Step 2: Exporting data to JSON..."
EXPORT_DIR="/tmp/lacylights_migration_$TIMESTAMP"
mkdir -p "$EXPORT_DIR"

# Use psql to export data as JSON
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM projects) t" \
  > "$EXPORT_DIR/projects.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM fixture_definitions ORDER BY created_at) t" \
  > "$EXPORT_DIR/fixture_definitions.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM channel_definitions ORDER BY definition_id, offset) t" \
  > "$EXPORT_DIR/channel_definitions.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM fixture_modes ORDER BY definition_id, name) t" \
  > "$EXPORT_DIR/fixture_modes.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM mode_channels ORDER BY mode_id, offset) t" \
  > "$EXPORT_DIR/mode_channels.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM fixture_instances ORDER BY project_id, universe, start_channel) t" \
  > "$EXPORT_DIR/fixture_instances.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM instance_channels ORDER BY fixture_id, offset) t" \
  > "$EXPORT_DIR/instance_channels.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM scenes ORDER BY project_id, created_at) t" \
  > "$EXPORT_DIR/scenes.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM fixture_values ORDER BY scene_id, scene_order) t" \
  > "$EXPORT_DIR/fixture_values.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM cue_lists ORDER BY project_id, created_at) t" \
  > "$EXPORT_DIR/cue_lists.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM cues ORDER BY cue_list_id, cue_number) t" \
  > "$EXPORT_DIR/cues.json"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -t \
  -A \
  -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM settings) t" \
  > "$EXPORT_DIR/settings.json"

echo "✓ Data exported to: $EXPORT_DIR"

# Count records
echo ""
echo "Record counts:"
for file in "$EXPORT_DIR"/*.json; do
  table=$(basename "$file" .json)
  count=$(grep -o '"id"' "$file" | wc -l)
  echo "  $table: $count records"
done

echo ""
echo "=========================================="
echo "Data export complete!"
echo "Migration data saved to: $EXPORT_DIR"
echo "PostgreSQL backup saved to: $BACKUP_DIR/postgres_backup_$TIMESTAMP.sql"
echo ""
echo "Next steps:"
echo "1. Stop the LacyLights server"
echo "2. Update .env to use SQLite: DATABASE_URL=\"file:$SQLITE_PATH\""
echo "3. Run: npx prisma db push --accept-data-loss"
echo "4. Run: node scripts/import-from-json.js $EXPORT_DIR"
echo "5. Start the server"
echo "=========================================="
