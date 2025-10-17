#!/bin/bash

# Complete PostgreSQL to SQLite Migration for LacyLights
# Handles enum conversion properly

set -e

SQLITE_PATH="/var/lib/lacylights/db.sqlite"
TEMP_DIR="/tmp/lacylights_migration_$$"
BACKUP_DIR="/var/lib/lacylights/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=========================================="
echo "PostgreSQL to SQLite Migration"
echo "=========================================="
echo "Source: PostgreSQL (Docker)"
echo "Target: $SQLITE_PATH"
echo "=========================================="

# Create directories
sudo mkdir -p "$BACKUP_DIR"
sudo mkdir -p "$(dirname "$SQLITE_PATH")"
sudo chown -R pi:pi /var/lib/lacylights
mkdir -p "$TEMP_DIR"

# Backup PostgreSQL
echo ""
echo "Step 1: Backing up PostgreSQL..."
docker exec lacylights-postgres pg_dump -U lacylights lacylights > "$BACKUP_DIR/postgres_backup_$TIMESTAMP.sql"
echo "✓ Backup saved: $BACKUP_DIR/postgres_backup_$TIMESTAMP.sql"

# Export data as CSV (this converts enums to text automatically)
echo ""
echo "Step 2: Exporting tables as CSV..."

# Get table list
TABLES=$(docker exec lacylights-postgres psql -U lacylights -d lacylights -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '%prisma%' ORDER BY tablename;")

for table in $TABLES; do
  echo "  Exporting $table..."
  docker exec lacylights-postgres psql -U lacylights -d lacylights -c "\COPY (SELECT * FROM $table) TO STDOUT WITH CSV HEADER" > "$TEMP_DIR/${table}.csv"
done

echo "✓ Data exported to $TEMP_DIR"

# Show record counts
echo ""
echo "Record counts from PostgreSQL:"
docker exec lacylights-postgres psql -U lacylights -d lacylights -t -c "
  SELECT 'projects: ' || COUNT(*) FROM projects
  UNION ALL SELECT 'fixture_definitions: ' || COUNT(*) FROM fixture_definitions
  UNION ALL SELECT 'fixture_instances: ' || COUNT(*) FROM fixture_instances
  UNION ALL SELECT 'scenes: ' || COUNT(*) FROM scenes
  UNION ALL SELECT 'cue_lists: ' || COUNT(*) FROM cue_lists
  UNION ALL SELECT 'cues: ' || COUNT(*) FROM cues;
"

# Import into SQLite
echo ""
echo "Step 3: Importing into SQLite..."

# Backup existing SQLite if it exists
if [ -f "$SQLITE_PATH" ]; then
  echo "  Backing up existing SQLite database..."
  cp "$SQLITE_PATH" "$BACKUP_DIR/sqlite_backup_$TIMESTAMP.db"
fi

# Import each CSV
for csv_file in "$TEMP_DIR"/*.csv; do
  table=$(basename "$csv_file" .csv)
  echo "  Importing $table..."

  # Use sqlite3 to import CSV
  sqlite3 "$SQLITE_PATH" <<EOF
.mode csv
.import "$csv_file" $table
EOF
done

echo "✓ Data imported into $SQLITE_PATH"

# Verify import
echo ""
echo "Record counts from SQLite:"
sqlite3 "$SQLITE_PATH" <<EOF
SELECT 'projects: ' || COUNT(*) FROM projects
UNION ALL SELECT 'fixture_definitions: ' || COUNT(*) FROM fixture_definitions
UNION ALL SELECT 'fixture_instances: ' || COUNT(*) FROM fixture_instances
UNION ALL SELECT 'scenes: ' || COUNT(*) FROM scenes
UNION ALL SELECT 'cue_lists: ' || COUNT(*) FROM cue_lists
UNION ALL SELECT 'cues: ' || COUNT(*) FROM cues;
EOF

# Verify database integrity
echo ""
echo "Step 4: Verifying database integrity..."
if sqlite3 "$SQLITE_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
  echo "✓ Database integrity check passed"
else
  echo "✗ Database integrity check failed!"
  exit 1
fi

# Clean up
echo ""
echo "Step 5: Cleaning up..."
rm -rf "$TEMP_DIR"
echo "✓ Temporary files removed"

echo ""
echo "=========================================="
echo "Migration Complete!"
echo "=========================================="
echo "SQLite database: $SQLITE_PATH"
echo "PostgreSQL backup: $BACKUP_DIR/postgres_backup_$TIMESTAMP.sql"
echo "SQLite backup: $BACKUP_DIR/sqlite_backup_$TIMESTAMP.db"
echo ""
echo "Database size:"
ls -lh "$SQLITE_PATH"
echo ""
echo "Next steps:"
echo "1. Test the server: npm start"
echo "2. If working, stop Docker: docker compose down"
echo "3. Remove Docker data: docker volume rm lacylights-postgres lacylights-redis"
echo "=========================================="
