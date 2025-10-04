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

# Install docker-compose
echo ""
echo "Installing docker-compose..."
if command -v docker-compose &> /dev/null; then
    echo "docker-compose is already installed: $(docker-compose --version)"
    read -p "Reinstall docker-compose? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo apt-get install -y docker-compose
    fi
else
    sudo apt-get install -y docker-compose
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
echo "  docker-compose: $(docker-compose --version)"
echo "  git: $(git --version)"
echo ""
echo "IMPORTANT: You must log out and log back in for docker group changes to take effect."
echo "Or run: newgrp docker"
echo ""
