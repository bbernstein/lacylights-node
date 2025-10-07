#!/bin/bash

# nginx Setup Script for LacyLights Raspberry Pi Deployment
# Installs and configures nginx to serve frontend and proxy to backend

set -e

echo "=========================================="
echo "LacyLights nginx Setup"
echo "=========================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "This script requires root privileges. Please run with sudo."
    exit 1
fi

# Install nginx if not already installed
if ! command -v nginx &> /dev/null; then
    echo ""
    echo "Installing nginx..."
    apt-get update
    apt-get install -y nginx
    echo "✓ nginx installed"
else
    echo ""
    echo "✓ nginx is already installed"
fi

# Stop nginx if running
echo ""
echo "Stopping nginx..."
systemctl stop nginx || true

# Copy nginx configuration
echo ""
echo "Installing LacyLights nginx configuration..."
NGINX_CONF_SOURCE="$(dirname "$0")/../deploy/nginx/lacylights.conf"
NGINX_CONF_DEST="/etc/nginx/sites-available/lacylights"

if [ ! -f "$NGINX_CONF_SOURCE" ]; then
    echo "ERROR: nginx configuration not found at $NGINX_CONF_SOURCE"
    exit 1
fi

cp "$NGINX_CONF_SOURCE" "$NGINX_CONF_DEST"
echo "✓ Configuration copied to $NGINX_CONF_DEST"

# Create symlink to enable the site
echo ""
echo "Enabling LacyLights site..."
ln -sf "$NGINX_CONF_DEST" /etc/nginx/sites-enabled/lacylights

# Remove default nginx site if it exists
if [ -L /etc/nginx/sites-enabled/default ]; then
    echo "Removing default nginx site..."
    rm /etc/nginx/sites-enabled/default
fi

# Test nginx configuration
echo ""
echo "Testing nginx configuration..."
if nginx -t; then
    echo "✓ nginx configuration is valid"
else
    echo "ERROR: nginx configuration test failed"
    exit 1
fi

# Create web root directory if it doesn't exist
echo ""
echo "Creating web root directory..."
WEB_ROOT="/var/www/lacylights"
mkdir -p "$WEB_ROOT"
chown -R www-data:www-data "$WEB_ROOT"
echo "✓ Web root created at $WEB_ROOT"

# Create log directory
echo ""
echo "Creating log directory..."
mkdir -p /var/log/nginx
touch /var/log/nginx/lacylights-access.log
touch /var/log/nginx/lacylights-error.log
chown -R www-data:adm /var/log/nginx
echo "✓ Log files created"

# Start nginx
echo ""
echo "Starting nginx..."
systemctl start nginx
systemctl enable nginx
echo "✓ nginx started and enabled"

# Check status
echo ""
echo "Checking nginx status..."
if systemctl is-active --quiet nginx; then
    echo "✓ nginx is running"
else
    echo "WARNING: nginx may not be running properly"
    systemctl status nginx --no-pager
fi

echo ""
echo "=========================================="
echo "nginx Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Deploy frontend files to: $WEB_ROOT"
echo "  2. Ensure backend is running on localhost:4000"
echo "  3. Access LacyLights at: http://lacylights.local"
echo ""
echo "Useful commands:"
echo "  Check status:  systemctl status nginx"
echo "  View logs:     tail -f /var/log/nginx/lacylights-error.log"
echo "  Reload config: nginx -t && systemctl reload nginx"
echo ""
