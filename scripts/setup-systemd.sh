#!/bin/bash

# systemd Setup Script for LacyLights Raspberry Pi Deployment
# Installs and configures systemd service for auto-start

set -e

echo "=========================================="
echo "LacyLights systemd Setup"
echo "=========================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "This script requires root privileges. Please run with sudo."
    exit 1
fi

# Copy systemd service file
echo ""
echo "Installing LacyLights systemd service..."
SERVICE_SOURCE="$(dirname "$0")/../deploy/systemd/lacylights.service"
SERVICE_DEST="/etc/systemd/system/lacylights.service"

if [ ! -f "$SERVICE_SOURCE" ]; then
    echo "ERROR: systemd service file not found at $SERVICE_SOURCE"
    exit 1
fi

cp "$SERVICE_SOURCE" "$SERVICE_DEST"
echo "✓ Service file copied to $SERVICE_DEST"

# Create necessary directories
echo ""
echo "Creating data directories..."
mkdir -p /var/lib/lacylights/logs
mkdir -p /var/lib/lacylights/backups
chown -R pi:pi /var/lib/lacylights
echo "✓ Data directories created"

# Ensure backend is built
BACKEND_DIR="/opt/lacylights/backend"
if [ ! -d "$BACKEND_DIR/dist" ]; then
    echo ""
    echo "WARNING: Backend not found at $BACKEND_DIR"
    echo "Please ensure the backend is deployed before starting the service"
fi

# Reload systemd
echo ""
echo "Reloading systemd daemon..."
systemctl daemon-reload
echo "✓ systemd daemon reloaded"

# Enable service
echo ""
echo "Enabling LacyLights service..."
systemctl enable lacylights.service
echo "✓ Service enabled (will start on boot)"

# Ask if user wants to start now
echo ""
read -p "Start LacyLights service now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    systemctl start lacylights.service
    sleep 2

    if systemctl is-active --quiet lacylights.service; then
        echo "✓ LacyLights service is running"
    else
        echo "⚠ Service may have failed to start. Check status:"
        systemctl status lacylights.service --no-pager --lines=20
    fi
else
    echo "Service not started. Start it manually with: sudo systemctl start lacylights"
fi

echo ""
echo "=========================================="
echo "systemd Setup Complete!"
echo "=========================================="
echo ""
echo "Service management commands:"
echo "  Start:   sudo systemctl start lacylights"
echo "  Stop:    sudo systemctl stop lacylights"
echo "  Restart: sudo systemctl restart lacylights"
echo "  Status:  sudo systemctl status lacylights"
echo "  Logs:    sudo journalctl -u lacylights -f"
echo ""
