#!/bin/bash

# Raspberry Pi Dependency Installation Script
# This script installs Node.js, npm, Docker, and docker-compose on a Raspberry Pi

set -e  # Exit on any error

echo "=========================================="
echo "LacyLights Raspberry Pi Dependency Setup"
echo "=========================================="

# Check if running on a Raspberry Pi
if [ ! -f /proc/device-tree/model ]; then
    echo "Warning: This doesn't appear to be a Raspberry Pi"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Update system packages
echo ""
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js via NodeSource repository (Node 20.x LTS)
echo ""
echo "Installing Node.js 20.x LTS..."
if command -v node &> /dev/null; then
    echo "Node.js is already installed: $(node --version)"
    read -p "Reinstall Node.js? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Install Docker
echo ""
echo "Installing Docker..."
if command -v docker &> /dev/null; then
    echo "Docker is already installed: $(docker --version)"
    read -p "Reinstall Docker? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        rm get-docker.sh
    fi
else
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
fi

# Add current user to docker group
echo ""
echo "Adding user to docker group..."
sudo usermod -aG docker $USER

# Check docker compose plugin (included with Docker)
echo ""
echo "Checking docker compose plugin..."
if docker compose version &> /dev/null; then
    echo "docker compose plugin is installed: $(docker compose version)"
else
    echo "Warning: docker compose plugin not found"
    echo "This should have been installed with Docker"
    echo "You may need to reinstall Docker or install the plugin manually"
fi

# Install git if not present
echo ""
echo "Checking for git..."
if ! command -v git &> /dev/null; then
    echo "Installing git..."
    sudo apt-get install -y git
else
    echo "git is already installed: $(git --version)"
fi

# Install build essentials (needed for some npm packages)
echo ""
echo "Installing build essentials..."
sudo apt-get install -y build-essential python3

echo ""
echo "=========================================="
echo "Installation complete!"
echo "=========================================="
echo ""
echo "Installed versions:"
echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"
echo "  Docker: $(docker --version)"
echo "  docker compose: $(docker compose version 2>/dev/null || echo 'not found')"
echo "  git: $(git --version)"
echo ""
echo "IMPORTANT: You must log out and log back in for docker group changes to take effect."
echo "Or run: newgrp docker"
echo ""
