#!/bin/bash

# Raspberry Pi Deployment Script
# Deploys LacyLights Node.js server to a Raspberry Pi using GitHub releases

set -e  # Exit on any error

# Configuration
PI_HOST="${PI_HOST:-lacylights.local}"
PI_USER="${PI_USER:-pi}"
ORG_NAME="bbernstein"
REPO_NAME="lacylights-node"
DEPLOY_DIR="/home/$PI_USER/lacylights-node"
SERVER_PORT="4000"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

echo "=========================================="
echo "LacyLights Raspberry Pi Deployment"
echo "=========================================="
echo "Target: $PI_USER@$PI_HOST"
echo "Repository: $ORG_NAME/$REPO_NAME"
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
print_status "Testing SSH connection..."
if ! run_on_pi "echo 'SSH connection successful'"; then
    print_error "Cannot connect to $PI_USER@$PI_HOST"
    echo "Please ensure:"
    echo "  1. The Raspberry Pi is on the network"
    echo "  2. SSH is enabled on the Pi"
    echo "  3. Your SSH key is configured (ssh pi@lacylights.local should work without password)"
    exit 1
fi

# Check if dependencies need to be installed
echo ""
print_status "Checking if dependencies are installed..."
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

if ! run_on_pi "command -v jq &> /dev/null"; then
    print_warning "jq is not installed (will use fallback JSON parsing)"
fi

# Install dependencies if needed
if [ "$DEPS_INSTALLED" = false ]; then
    echo ""
    print_status "Dependencies are missing. Installing..."

    # Copy installation script to Pi
    copy_to_pi "scripts/install-pi-deps.sh" "/tmp/install-pi-deps.sh"

    # Make it executable and run it
    run_on_pi "chmod +x /tmp/install-pi-deps.sh && /tmp/install-pi-deps.sh"

    echo ""
    print_warning "Dependencies installed. Please log out and back in to the Pi, then run this script again."
    echo "Or run this on the Pi: newgrp docker"
    exit 0
else
    print_success "All dependencies are installed"
fi

# Get the latest release version from GitHub
echo ""
print_status "Fetching latest release version..."
API_URL="https://api.github.com/repos/$ORG_NAME/$REPO_NAME/releases/latest"

# Fetch API response once to avoid multiple network calls
API_RESPONSE=$(curl -s "$API_URL")

# Try with jq first, fallback to grep
if run_on_pi "command -v jq &> /dev/null"; then
    LATEST_VERSION=$(echo "$API_RESPONSE" | jq -r '.tag_name // empty')
    TARBALL_URL=$(echo "$API_RESPONSE" | jq -r '.tarball_url // empty')
else
    LATEST_VERSION=$(echo "$API_RESPONSE" | grep '"tag_name"' | cut -d '"' -f 4)
    TARBALL_URL=$(echo "$API_RESPONSE" | grep '"tarball_url"' | cut -d '"' -f 4)
fi

if [ -z "$LATEST_VERSION" ] || [ "$LATEST_VERSION" = "null" ]; then
    print_error "Could not determine latest version"
    exit 1
fi

if [ -z "$TARBALL_URL" ] || [ "$TARBALL_URL" = "null" ]; then
    print_error "Could not find release tarball URL"
    exit 1
fi

print_success "Latest version: $LATEST_VERSION"

# Check current installed version
INSTALLED_VERSION=$(run_on_pi "[ -f $DEPLOY_DIR/.lacylights-version ] && cat $DEPLOY_DIR/.lacylights-version || echo 'none'")

if [ "$INSTALLED_VERSION" = "$LATEST_VERSION" ]; then
    print_success "Already running latest version ($LATEST_VERSION)"
    echo ""
    echo "To force a reinstall, remove the version file on the Pi:"
    echo "  ssh $PI_USER@$PI_HOST 'rm $DEPLOY_DIR/.lacylights-version'"
    exit 0
fi

print_status "Updating from $INSTALLED_VERSION to $LATEST_VERSION"

# Download and extract release on Pi
echo ""
print_status "Downloading and extracting release on Pi..."

# Create a deployment script that will run on the Pi
# Use single quotes in the heredoc to prevent local variable expansion, ensuring variables are only expanded on the Pi side for security
DEPLOY_SCRIPT=$(cat <<'REMOTE_SCRIPT'
#!/bin/bash
set -e

DEPLOY_DIR="$1"
TARBALL_URL="$2"
LATEST_VERSION="$3"

# Create temporary directory for download
TEMP_DIR=$(mktemp -d)
if [ -z "$TEMP_DIR" ] || [ ! -d "$TEMP_DIR" ]; then
    echo "Failed to create temporary directory."
    echo "Possible causes: insufficient disk space, lack of permissions, or system limits on temporary files."
    exit 1
fi

# Backup existing .env file if it exists
TEMP_BACKUP=$(mktemp -d)
if [ -d "$DEPLOY_DIR" ] && [ -f "$DEPLOY_DIR/.env" ]; then
    cp "$DEPLOY_DIR/.env" "$TEMP_BACKUP/.env"
    echo "Backed up .env file"
fi

# Download the release archive
echo "Downloading release..."
ARCHIVE_FILE="$TEMP_DIR/lacylights-node.tar.gz"
curl -sL "$TARBALL_URL" -o "$ARCHIVE_FILE"

# Extract to temporary location
echo "Extracting archive..."
mkdir -p "$TEMP_DIR/extract"
tar -xzf "$ARCHIVE_FILE" -C "$TEMP_DIR/extract" --strip-components=1

# Remove old directory if it exists
if [ -d "$DEPLOY_DIR" ]; then
    rm -rf "$DEPLOY_DIR"
fi

# Move extracted files to deployment directory
mv "$TEMP_DIR/extract" "$DEPLOY_DIR"

# Restore .env file if it was backed up
if [ -f "$TEMP_BACKUP/.env" ]; then
    cp "$TEMP_BACKUP/.env" "$DEPLOY_DIR/.env"
    echo "Restored .env file"
fi

# Write version file
echo "$LATEST_VERSION" > "$DEPLOY_DIR/.lacylights-version"

# Clean up
rm -rf "$TEMP_DIR" "$TEMP_BACKUP"

echo "Extraction complete"
REMOTE_SCRIPT
)

# Upload and execute the deployment script on the Pi
echo "$DEPLOY_SCRIPT" | run_on_pi "cat > /tmp/deploy-lacylights.sh"
run_on_pi "chmod +x /tmp/deploy-lacylights.sh"
run_on_pi "/tmp/deploy-lacylights.sh '$DEPLOY_DIR' '$TARBALL_URL' '$LATEST_VERSION'"

print_success "Release downloaded and extracted"

# Create .env file if it doesn't exist
echo ""
print_status "Setting up environment configuration..."
if ! run_on_pi "[ -f $DEPLOY_DIR/.env ]"; then
    print_status "Creating .env file from .env.example..."
    run_on_pi "cp $DEPLOY_DIR/.env.example $DEPLOY_DIR/.env"

    # Configure for Pi environment
    run_on_pi "cd $DEPLOY_DIR && sed -i 's/NODE_ENV=development/NODE_ENV=production/' .env"
    run_on_pi "cd $DEPLOY_DIR && sed -i 's/# NON_INTERACTIVE=false/NON_INTERACTIVE=true/' .env"

    print_warning "IMPORTANT: Configure Art-Net broadcast address via the Settings UI after deployment"
    print_warning "  Access web UI at: http://$PI_HOST:$SERVER_PORT"
else
    print_success ".env file already exists"
fi

# Install npm dependencies
echo ""
print_status "Installing npm dependencies..."
run_on_pi "cd $DEPLOY_DIR && npm install"
print_success "Dependencies installed"

# Build the application
echo ""
print_status "Building application..."
run_on_pi "cd $DEPLOY_DIR && npm run build"
print_success "Build complete"

# Start Docker services
echo ""
print_status "Starting Docker services..."
run_on_pi "cd $DEPLOY_DIR && docker compose down || true"
run_on_pi "cd $DEPLOY_DIR && docker compose up -d"
print_success "Docker services started"

# Wait for database to be ready
echo ""
print_status "Waiting for database to be ready..."
sleep 10

# Run database migrations
echo ""
print_status "Running database migrations..."
run_on_pi "cd $DEPLOY_DIR && npm run db:migrate"
print_success "Migrations complete"

# Generate Prisma client
echo ""
print_status "Generating Prisma client..."
run_on_pi "cd $DEPLOY_DIR && npm run db:generate"
print_success "Prisma client generated"

# Start the application
echo ""
print_status "Starting LacyLights server..."
run_on_pi "cd $DEPLOY_DIR && npm run stop || true"  # Stop any existing instance
run_on_pi "cd $DEPLOY_DIR && npm start"
print_success "Server started"

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo ""
echo "Deployed version: $LATEST_VERSION"
echo "Server running at: http://$PI_HOST:$SERVER_PORT"
echo ""
echo "Useful commands:"
echo "  View logs:    ssh $PI_USER@$PI_HOST 'cd $DEPLOY_DIR && tail -f server.log'"
echo "  Stop server:  ssh $PI_USER@$PI_HOST 'cd $DEPLOY_DIR && npm run stop'"
echo "  Restart:      ssh $PI_USER@$PI_HOST 'cd $DEPLOY_DIR && npm run stop && npm start'"
echo "  SSH to Pi:    ssh $PI_USER@$PI_HOST"
echo ""
