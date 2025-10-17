#!/bin/bash

# SQLite Backup Script for LacyLights
# Creates a backup of the SQLite database with automatic rotation

set -e  # Exit on any error

# Configuration
SQLITE_PATH="${SQLITE_PATH:-/var/lib/lacylights/db.sqlite}"
BACKUP_DIR="/var/lib/lacylights/backups"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_ONLY=$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/db-$DATE_ONLY.sqlite"
BACKUP_TEMP="$BACKUP_DIR/db-$TIMESTAMP.sqlite.tmp"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if source database exists
if [ ! -f "$SQLITE_PATH" ]; then
  echo "Error: Database file not found: $SQLITE_PATH"
  exit 1
fi

# Get database size
DB_SIZE=$(du -h "$SQLITE_PATH" | cut -f1)

echo "=========================================="
echo "LacyLights SQLite Backup"
echo "=========================================="
echo "Source: $SQLITE_PATH ($DB_SIZE)"
echo "Backup: $BACKUP_FILE"
echo "Date: $(date)"
echo "=========================================="

# Create backup using SQLite's backup command (safer than file copy during writes)
sqlite3 "$SQLITE_PATH" ".backup $BACKUP_TEMP"

# If backup for today already exists, remove it
if [ -f "$BACKUP_FILE" ]; then
  echo "Replacing existing backup for today..."
  rm "$BACKUP_FILE"
fi

# Move temp backup to final location
mv "$BACKUP_TEMP" "$BACKUP_FILE"

# Verify backup
if sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✓ Backup completed successfully: $BACKUP_FILE ($BACKUP_SIZE)"
else
  echo "✗ Backup verification failed!"
  rm "$BACKUP_FILE"
  exit 1
fi

# Remove old backups
echo ""
echo "Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "db-*.sqlite" -type f -mtime +$RETENTION_DAYS -delete

# List remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "db-*.sqlite" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "✓ Backup retention: $BACKUP_COUNT backups ($TOTAL_SIZE total)"

echo ""
echo "=========================================="
echo "Backup complete!"
echo "=========================================="
