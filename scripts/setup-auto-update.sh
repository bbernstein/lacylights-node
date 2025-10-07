#!/bin/bash

# Auto-Update Setup Script for LacyLights
# Configures cron job for automatic updates

set -e

echo "=========================================="
echo "LacyLights Auto-Update Setup"
echo "=========================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "This script requires root privileges. Please run with sudo."
    exit 1
fi

# Copy configuration file
echo ""
echo "Installing auto-update configuration..."
CONFIG_SOURCE="$(dirname "$0")/../deploy/config/update.conf"
CONFIG_DEST="/etc/lacylights/update.conf"

mkdir -p /etc/lacylights
if [ -f "$CONFIG_SOURCE" ]; then
    if [ -f "$CONFIG_DEST" ]; then
        echo "Configuration file already exists at $CONFIG_DEST"
        read -p "Overwrite? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "$CONFIG_SOURCE" "$CONFIG_DEST"
            echo "✓ Configuration updated"
        else
            echo "Keeping existing configuration"
        fi
    else
        cp "$CONFIG_SOURCE" "$CONFIG_DEST"
        echo "✓ Configuration installed"
    fi
else
    echo "WARNING: Source configuration not found at $CONFIG_SOURCE"
    echo "Creating default configuration..."
    cat > "$CONFIG_DEST" <<'EOF'
# LacyLights Auto-Update Configuration
AUTO_UPDATE_ENABLED=true
UPDATE_BRANCH=main
UPDATE_CRON_SCHEDULE="0 3 * * *"
RUN_TESTS_BEFORE_UPDATE=true
BACKUP_DATABASE=true
BACKUP_RETENTION_DAYS=30
UPDATE_LOG_FILE=/var/lib/lacylights/logs/update.log
MAX_LOG_SIZE_MB=10
EOF
    echo "✓ Default configuration created"
fi

# Load configuration
source "$CONFIG_DEST"

# Make auto-update script executable
SCRIPT_PATH="/opt/lacylights/backend/scripts/auto-update.sh"
if [ ! -f "$SCRIPT_PATH" ]; then
    echo ""
    echo "WARNING: Auto-update script not found at $SCRIPT_PATH"
    echo "Please ensure the backend is deployed first"
    exit 1
fi

chmod +x "$SCRIPT_PATH"

# Create log directory
echo ""
echo "Creating log directory..."
mkdir -p "$(dirname "$UPDATE_LOG_FILE")"
chown -R pi:pi "$(dirname "$UPDATE_LOG_FILE")"
echo "✓ Log directory created"

# Set up cron job
echo ""
echo "Setting up cron job..."
CRON_LINE="$UPDATE_CRON_SCHEDULE $SCRIPT_PATH"
CRON_FILE="/etc/cron.d/lacylights-update"

cat > "$CRON_FILE" <<EOF
# LacyLights Auto-Update Cron Job
# Updates LacyLights automatically from git repository

SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
UPDATE_CONFIG=$CONFIG_DEST

# Schedule: $UPDATE_CRON_SCHEDULE
$CRON_LINE

EOF

chmod 0644 "$CRON_FILE"
echo "✓ Cron job installed at $CRON_FILE"

# Show configuration
echo ""
echo "=========================================="
echo "Auto-Update Configuration"
echo "=========================================="
echo "Enabled:          $AUTO_UPDATE_ENABLED"
echo "Branch:           $UPDATE_BRANCH"
echo "Schedule:         $UPDATE_CRON_SCHEDULE"
echo "Run tests:        $RUN_TESTS_BEFORE_UPDATE"
echo "Backup database:  $BACKUP_DATABASE"
echo "Log file:         $UPDATE_LOG_FILE"
echo ""

# Option to run update now
echo ""
read -p "Run update check now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Running update check..."
    sudo -u pi "$SCRIPT_PATH" || echo "Update check completed (see log for details)"
else
    echo "Update will run automatically according to schedule: $UPDATE_CRON_SCHEDULE"
fi

echo ""
echo "=========================================="
echo "Auto-Update Setup Complete!"
echo "=========================================="
echo ""
echo "Configuration file: $CONFIG_DEST"
echo "Cron job file:      $CRON_FILE"
echo "Log file:           $UPDATE_LOG_FILE"
echo ""
echo "To disable auto-updates, edit $CONFIG_DEST"
echo "and set AUTO_UPDATE_ENABLED=false"
echo ""
echo "To manually trigger an update:"
echo "  sudo $SCRIPT_PATH"
echo ""
echo "To view update logs:"
echo "  tail -f $UPDATE_LOG_FILE"
echo ""
