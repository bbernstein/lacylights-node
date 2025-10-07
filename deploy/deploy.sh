#!/bin/bash

# LacyLights Raspberry Pi Deployment Script
# Deploys complete LacyLights system to Raspberry Pi

set -e

echo "=========================================="
echo "LacyLights Raspberry Pi Deployment"
echo "=========================================="
echo ""

# Configuration
DEPLOY_DIR="/opt/lacylights"
DATA_DIR="/var/lib/lacylights"
LOG_DIR="/var/lib/lacylights/logs"
BACKEND_REPO="https://github.com/bbernstein/lacylights-node.git"
FRONTEND_REPO="https://github.com/bbernstein/lacylights-fe.git"
BACKEND_BRANCH="${BACKEND_BRANCH:-main}"
FRONTEND_BRANCH="${FRONTEND_BRANCH:-main}"
PI_USER="${PI_USER:-pi}"

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then
    echo "This script must be run with sudo"
    exit 1
fi

# Step 1: Install system dependencies
echo ""
echo "Step 1: Installing system dependencies..."
echo "==========================================="

# Check if Node.js is already installed
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "Node.js already installed: $NODE_VERSION"

    # Check if npm is available (nodesource includes npm)
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        echo "npm already installed: $NPM_VERSION"
        INSTALL_NODE=false
    else
        echo "npm not found, will install"
        INSTALL_NODE=true
    fi
else
    echo "Node.js not found, will install"
    INSTALL_NODE=true
fi

apt-get update

# Install base dependencies (excluding Node.js/npm if already present)
if [ "$INSTALL_NODE" = true ]; then
    echo "Installing Node.js and npm..."
    apt-get install -y \
        git \
        nginx \
        nodejs \
        npm \
        sqlite3 \
        curl
else
    echo "Skipping Node.js/npm installation (already present)"
    apt-get install -y \
        git \
        nginx \
        sqlite3 \
        curl
fi

echo "✓ System dependencies installed"

# Step 2: Create directories
echo ""
echo "Step 2: Creating directories..."
echo "==========================================="
mkdir -p "$DEPLOY_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$LOG_DIR"
mkdir -p /etc/lacylights

# Set ownership
chown -R $PI_USER:$PI_USER "$DEPLOY_DIR"
chown -R $PI_USER:$PI_USER "$DATA_DIR"

echo "✓ Directories created"

# Step 3: Clone/update backend repository
echo ""
echo "Step 3: Setting up backend..."
echo "==========================================="
if [ -d "$DEPLOY_DIR/backend" ]; then
    echo "Backend directory exists, pulling latest changes..."
    cd "$DEPLOY_DIR/backend"
    sudo -u $PI_USER git fetch origin
    sudo -u $PI_USER git checkout $BACKEND_BRANCH
    sudo -u $PI_USER git pull origin $BACKEND_BRANCH
else
    echo "Cloning backend repository..."
    cd "$DEPLOY_DIR"
    sudo -u $PI_USER git clone -b $BACKEND_BRANCH "$BACKEND_REPO" backend
    cd backend
fi

# Create .env file for backend
echo "Creating backend .env file..."
cat > "$DEPLOY_DIR/backend/.env" <<EOF
# Database
DATABASE_URL="file:$DATA_DIR/db.sqlite"

# Server Configuration
PORT=4000
NODE_ENV=production

# CORS Configuration
CORS_ORIGIN=*

# DMX Configuration
DMX_UNIVERSE_COUNT=4
DMX_REFRESH_RATE=44

# Art-Net Configuration
ARTNET_ENABLED=true
# ARTNET_BROADCAST=192.168.1.255

# Session Configuration
SESSION_SECRET=$(openssl rand -hex 32)

# Docker Configuration
DOCKER_MODE=false
EOF
chown $PI_USER:$PI_USER "$DEPLOY_DIR/backend/.env"
echo "✓ Backend .env file created"

# Install backend dependencies
echo "Installing backend dependencies..."
sudo -u $PI_USER npm install

# Generate Prisma Client (must be done before build)
echo "Generating Prisma Client..."
sudo -u $PI_USER npm run db:generate

# Build backend
echo "Building backend..."
sudo -u $PI_USER npm run build

# Run database migrations
echo "Running database migrations..."
sudo -u $PI_USER npm run db:migrate

echo "✓ Backend setup complete"

# Step 4: Clone/update frontend repository
echo ""
echo "Step 4: Setting up frontend..."
echo "==========================================="
if [ -d "$DEPLOY_DIR/frontend-src" ]; then
    echo "Frontend source directory exists, pulling latest changes..."
    cd "$DEPLOY_DIR/frontend-src"
    sudo -u $PI_USER git fetch origin
    sudo -u $PI_USER git checkout $FRONTEND_BRANCH
    sudo -u $PI_USER git pull origin $FRONTEND_BRANCH
else
    echo "Cloning frontend repository..."
    cd "$DEPLOY_DIR"
    sudo -u $PI_USER git clone -b $FRONTEND_BRANCH "$FRONTEND_REPO" frontend-src
    cd frontend-src
fi

# Install frontend dependencies
echo "Installing frontend dependencies..."
sudo -u $PI_USER npm install

# Build frontend static export
echo "Building frontend static export..."
sudo -u $PI_USER npm run build

# Copy built frontend to web root
echo "Deploying frontend static files..."
rm -rf "$DEPLOY_DIR/frontend"
mkdir -p "$DEPLOY_DIR/frontend"
cp -r out/* "$DEPLOY_DIR/frontend/"
chown -R www-data:www-data "$DEPLOY_DIR/frontend"

echo "✓ Frontend setup complete"

# Step 5: Configure nginx
echo ""
echo "Step 5: Configuring nginx..."
echo "==========================================="
if [ -f "$DEPLOY_DIR/backend/deploy/nginx/lacylights.conf" ]; then
    cp "$DEPLOY_DIR/backend/deploy/nginx/lacylights.conf" /etc/nginx/sites-available/lacylights
    ln -sf /etc/nginx/sites-available/lacylights /etc/nginx/sites-enabled/lacylights

    # Remove default nginx site if it exists
    rm -f /etc/nginx/sites-enabled/default

    # Test nginx configuration
    nginx -t

    # Reload nginx
    systemctl reload nginx
    systemctl enable nginx

    echo "✓ nginx configured and reloaded"
else
    echo "WARNING: nginx config not found, skipping nginx setup"
fi

# Step 6: Configure systemd service
echo ""
echo "Step 6: Configuring systemd service..."
echo "==========================================="
if [ -f "$DEPLOY_DIR/backend/deploy/systemd/lacylights.service" ]; then
    cp "$DEPLOY_DIR/backend/deploy/systemd/lacylights.service" /etc/systemd/system/lacylights.service

    # Reload systemd
    systemctl daemon-reload

    # Enable and start service
    systemctl enable lacylights
    systemctl restart lacylights

    echo "✓ systemd service configured and started"
else
    echo "WARNING: systemd service file not found, skipping service setup"
fi

# Step 7: Set up auto-updates
echo ""
echo "Step 7: Setting up auto-updates..."
echo "==========================================="
if [ -f "$DEPLOY_DIR/backend/scripts/setup-auto-update.sh" ]; then
    chmod +x "$DEPLOY_DIR/backend/scripts/setup-auto-update.sh"
    echo "Auto-update script is available at $DEPLOY_DIR/backend/scripts/setup-auto-update.sh"
    echo "Run it manually if you want to enable automatic updates"
else
    echo "WARNING: Auto-update script not found"
fi

# Step 8: Verify deployment
echo ""
echo "Step 8: Verifying deployment..."
echo "==========================================="

# Check if backend service is running
if systemctl is-active --quiet lacylights; then
    echo "✓ Backend service is running"
else
    echo "✗ Backend service is not running"
    systemctl status lacylights --no-pager
fi

# Check if nginx is running
if systemctl is-active --quiet nginx; then
    echo "✓ nginx is running"
else
    echo "✗ nginx is not running"
fi

# Check database
if [ -f "$DATA_DIR/db.sqlite" ]; then
    DB_SIZE=$(du -h "$DATA_DIR/db.sqlite" | cut -f1)
    echo "✓ Database exists ($DB_SIZE)"
else
    echo "✗ Database file not found"
fi

# Check frontend files
if [ -d "$DEPLOY_DIR/frontend" ] && [ -f "$DEPLOY_DIR/frontend/index.html" ]; then
    echo "✓ Frontend files deployed"
else
    echo "✗ Frontend files not found"
fi

# Display service logs
echo ""
echo "Recent backend service logs:"
echo "----------------------------"
journalctl -u lacylights -n 10 --no-pager

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "LacyLights should now be accessible at:"
echo "  http://$(hostname).local"
echo "  http://$(hostname -I | awk '{print $1}')"
echo ""
echo "Next steps:"
echo "  1. Access the web interface at the URL above"
echo "  2. Optionally run auto-update setup: sudo $DEPLOY_DIR/backend/scripts/setup-auto-update.sh"
echo "  3. View backend logs: journalctl -u lacylights -f"
echo "  4. View nginx logs: tail -f /var/log/nginx/error.log"
echo ""
echo "Configuration files:"
echo "  Backend:      $DEPLOY_DIR/backend"
echo "  Frontend:     $DEPLOY_DIR/frontend"
echo "  Database:     $DATA_DIR/db.sqlite"
echo "  nginx:        /etc/nginx/sites-available/lacylights"
echo "  systemd:      /etc/systemd/system/lacylights.service"
echo ""
