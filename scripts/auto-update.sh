#!/bin/bash

# LacyLights Auto-Update Script
# Checks for updates from git, tests, and applies them automatically

set -e

# Load configuration
CONFIG_FILE="${UPDATE_CONFIG:-/etc/lacylights/update.conf}"
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
else
    # Default values if config doesn't exist
    AUTO_UPDATE_ENABLED=true
    UPDATE_BRANCH=main
    RUN_TESTS_BEFORE_UPDATE=true
    BACKUP_DATABASE=true
    BACKUP_RETENTION_DAYS=30
    UPDATE_LOG_FILE=/var/lib/lacylights/logs/update.log
fi

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$UPDATE_LOG_FILE"
}

# Check if updates are enabled
if [ "$AUTO_UPDATE_ENABLED" != "true" ]; then
    log "Auto-update is disabled in configuration. Exiting."
    exit 0
fi

log "========== LacyLights Auto-Update Started =========="

# Change to backend directory
BACKEND_DIR="/opt/lacylights/backend"
if [ ! -d "$BACKEND_DIR" ]; then
    log "ERROR: Backend directory not found: $BACKEND_DIR"
    exit 1
fi

cd "$BACKEND_DIR"

# Get current commit hash
CURRENT_COMMIT=$(git rev-parse HEAD)
log "Current commit: $CURRENT_COMMIT"

# Fetch latest changes
log "Fetching latest changes from origin/$UPDATE_BRANCH..."
git fetch origin "$UPDATE_BRANCH"

# Get latest commit hash
LATEST_COMMIT=$(git rev-parse origin/$UPDATE_BRANCH)
log "Latest commit: $LATEST_COMMIT"

# Check if update is needed
if [ "$CURRENT_COMMIT" == "$LATEST_COMMIT" ]; then
    log "Already up to date. No update needed."
    log "========== Auto-Update Completed (No Changes) =========="
    exit 0
fi

log "New version available. Preparing to update..."

# Backup database if enabled
if [ "$BACKUP_DATABASE" == "true" ]; then
    log "Backing up database..."
    BACKUP_DIR="/var/lib/lacylights/backups"
    mkdir -p "$BACKUP_DIR"

    DB_FILE="/var/lib/lacylights/db.sqlite"
    if [ -f "$DB_FILE" ]; then
        BACKUP_FILE="$BACKUP_DIR/db-$(date +%Y%m%d-%H%M%S).sqlite"
        cp "$DB_FILE" "$BACKUP_FILE"
        log "Database backed up to: $BACKUP_FILE"

        # Clean old backups
        find "$BACKUP_DIR" -name "db-*.sqlite" -mtime +$BACKUP_RETENTION_DAYS -delete
        log "Cleaned backups older than $BACKUP_RETENTION_DAYS days"
    else
        log "WARNING: Database file not found, skipping backup"
    fi
fi

# Pull latest changes
log "Pulling latest changes..."
git pull origin "$UPDATE_BRANCH"

# Install dependencies
log "Installing dependencies..."
npm install --production

# Build application
log "Building application..."
npm run build

# Run tests if enabled
if [ "$RUN_TESTS_BEFORE_UPDATE" == "true" ]; then
    log "Running tests..."
    if npm test; then
        log "✓ Tests passed"
    else
        log "ERROR: Tests failed. Rolling back..."

        # Rollback to previous commit
        git reset --hard "$CURRENT_COMMIT"
        npm install --production
        npm run build

        log "Rollback completed. Update aborted."
        log "========== Auto-Update Failed (Tests Failed) =========="
        exit 1
    fi
else
    log "Skipping tests (disabled in configuration)"
fi

# Generate Prisma client (in case schema changed)
log "Regenerating Prisma client..."
npm run db:generate

# Run migrations
log "Running database migrations..."
npm run db:migrate || log "WARNING: Migration failed or no migrations to apply"

# Restart service
log "Restarting LacyLights service..."
if command -v systemctl &> /dev/null; then
    systemctl restart lacylights.service
    sleep 3

    if systemctl is-active --quiet lacylights.service; then
        log "✓ Service restarted successfully"
    else
        log "ERROR: Service failed to restart after update!"
        log "Attempting rollback..."

        # Rollback
        git reset --hard "$CURRENT_COMMIT"
        npm install --production
        npm run build
        systemctl restart lacylights.service

        log "Rollback completed."
        log "========== Auto-Update Failed (Service Restart Failed) =========="
        exit 1
    fi
else
    log "WARNING: systemctl not found. Cannot restart service automatically."
    log "Please restart the LacyLights service manually."
fi

log "Update successful! Updated from $CURRENT_COMMIT to $LATEST_COMMIT"
log "========== Auto-Update Completed Successfully =========="

# Trim log file if it's too large
if [ -n "$MAX_LOG_SIZE_MB" ]; then
    LOG_SIZE_MB=$(du -m "$UPDATE_LOG_FILE" 2>/dev/null | cut -f1)
    if [ "$LOG_SIZE_MB" -gt "$MAX_LOG_SIZE_MB" ]; then
        log "Log file exceeds $MAX_LOG_SIZE_MB MB, rotating..."
        mv "$UPDATE_LOG_FILE" "$UPDATE_LOG_FILE.old"
        touch "$UPDATE_LOG_FILE"
    fi
fi

exit 0
