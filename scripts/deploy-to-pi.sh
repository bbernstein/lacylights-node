#!/bin/bash

# Raspberry Pi Deployment Script
# Deploys LacyLights Node.js server to a Raspberry Pi

set -e  # Exit on any error

# Configuration
PI_HOST="${PI_HOST:-lacylights.local}"
PI_USER="${PI_USER:-pi}"
REPO_URL="https://github.com/bbernstein/lacylights-node.git"
BRANCH_NAME="${BRANCH_NAME:-main}"
DEPLOY_DIR="/home/$PI_USER/lacylights-node"

echo "=========================================="
echo "LacyLights Raspberry Pi Deployment"
echo "=========================================="
echo "Target: $PI_USER@$PI_HOST"
echo "Branch: $BRANCH_NAME"
echo "=========================================="

# Function to run commands on Pi
run_on_pi() {
    ssh "$PI_USER@$PI_HOST" "$@"
}

# Function to copy files to Pi
copy_to_pi() {
    scp "$1" "$PI_USER@$PI_HOST:$2"
}

# Test SSH connection
echo ""
echo "Testing SSH connection..."
if ! run_on_pi "echo 'SSH connection successful'"; then
    echo "ERROR: Cannot connect to $PI_USER@$PI_HOST"
    echo "Please ensure:"
    echo "  1. The Raspberry Pi is on the network"
    echo "  2. SSH is enabled on the Pi"
    echo "  3. Your SSH key is configured (ssh pi@lacylights.local should work without password)"
    exit 1
fi

# Check if dependencies need to be installed
echo ""
echo "Checking if dependencies are installed..."
DEPS_INSTALLED=true

if ! run_on_pi "command -v node &> /dev/null"; then
    echo "Node.js is not installed"
    DEPS_INSTALLED=false
fi

if ! run_on_pi "command -v docker &> /dev/null"; then
    echo "Docker is not installed"
    DEPS_INSTALLED=false
fi

if ! run_on_pi "docker compose version &> /dev/null"; then
    echo "docker compose plugin is not installed"
    DEPS_INSTALLED=false
fi

# Install dependencies if needed
if [ "$DEPS_INSTALLED" = false ]; then
    echo ""
    echo "Dependencies are missing. Installing..."

    # Copy installation script to Pi
    copy_to_pi "scripts/install-pi-deps.sh" "/tmp/install-pi-deps.sh"

    # Make it executable and run it
    run_on_pi "chmod +x /tmp/install-pi-deps.sh && /tmp/install-pi-deps.sh"

    echo ""
    echo "Dependencies installed. Please log out and back in to the Pi, then run this script again."
    echo "Or run this on the Pi: newgrp docker"
    exit 0
else
    echo "All dependencies are installed"
fi

# Clone or update repository
echo ""
echo "Setting up repository on Pi..."
if run_on_pi "[ -d $DEPLOY_DIR ]"; then
    echo "Repository already exists, updating..."
    run_on_pi "cd $DEPLOY_DIR && git fetch origin && git checkout $BRANCH_NAME && git pull origin $BRANCH_NAME"
else
    echo "Cloning repository..."
    run_on_pi "git clone -b $BRANCH_NAME $REPO_URL $DEPLOY_DIR"
fi

# Install npm dependencies
echo ""
echo "Installing npm dependencies..."
run_on_pi "cd $DEPLOY_DIR && npm install"

# Create .env file if it doesn't exist
echo ""
echo "Setting up environment configuration..."
if ! run_on_pi "[ -f $DEPLOY_DIR/.env ]"; then
    echo "Creating .env file from .env.example..."
    run_on_pi "cp $DEPLOY_DIR/.env.example $DEPLOY_DIR/.env"

    # Configure for Pi environment
    run_on_pi "cd $DEPLOY_DIR && sed -i 's/NODE_ENV=development/NODE_ENV=production/' .env"
    run_on_pi "cd $DEPLOY_DIR && sed -i 's/# NON_INTERACTIVE=false/NON_INTERACTIVE=true/' .env"

    echo "IMPORTANT: Configure Art-Net broadcast address via the Settings UI after deployment"
    echo "  Access web UI at: http://$PI_HOST"
else
    echo ".env file already exists"
fi

# Build the application
echo ""
echo "Building application..."
run_on_pi "cd $DEPLOY_DIR && npm run build"

# Start Docker services
echo ""
echo "Starting Docker services..."
run_on_pi "cd $DEPLOY_DIR && docker compose down || true"
run_on_pi "cd $DEPLOY_DIR && docker compose up -d"

# Wait for database to be ready
echo ""
echo "Waiting for database to be ready..."
sleep 10

# Run database migrations
echo ""
echo "Running database migrations..."
run_on_pi "cd $DEPLOY_DIR && npm run db:migrate"

# Generate Prisma client
echo ""
echo "Generating Prisma client..."
run_on_pi "cd $DEPLOY_DIR && npm run db:generate"

# Start the application
echo ""
echo "Starting LacyLights server..."
run_on_pi "cd $DEPLOY_DIR && npm run stop || true"  # Stop any existing instance
run_on_pi "cd $DEPLOY_DIR && npm start"

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo ""
echo "Server should be running at: http://$PI_HOST:4000"
echo ""
echo "Useful commands:"
echo "  View logs:    ssh $PI_USER@$PI_HOST 'cd $DEPLOY_DIR && tail -f server.log'"
echo "  Stop server:  ssh $PI_USER@$PI_HOST 'cd $DEPLOY_DIR && npm run stop'"
echo "  Restart:      ssh $PI_USER@$PI_HOST 'cd $DEPLOY_DIR && npm run stop && npm start'"
echo "  SSH to Pi:    ssh $PI_USER@$PI_HOST"
echo ""
