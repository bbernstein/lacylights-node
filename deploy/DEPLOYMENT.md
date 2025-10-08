# LacyLights Raspberry Pi Deployment Guide

This guide explains how to deploy LacyLights to a Raspberry Pi as a turnkey hardware product.

## Prerequisites

### Hardware
- Raspberry Pi 4 (2GB RAM minimum, 4GB recommended)
- MicroSD card (16GB minimum, 32GB recommended)
- Network connection (Ethernet recommended for Art-Net)

### Software
- Raspberry Pi OS Lite (64-bit) - Latest version
- SSH access enabled
- Internet connection for initial setup

## Quick Start

### 1. Prepare Raspberry Pi

Flash Raspberry Pi OS to your SD card and configure:
```bash
# On first boot, run raspi-config
sudo raspi-config

# Set hostname to "lacylights" (optional but recommended)
# Enable SSH if not already enabled
# Set timezone
# Update system: Update option in raspi-config
```

### 2. Copy Deployment Script to Raspberry Pi

From your development machine:
```bash
# Copy the deployment script
scp deploy/deploy.sh pi@lacylights.local:/tmp/

# SSH into the Raspberry Pi
ssh pi@lacylights.local
```

### 3. Run Deployment

On the Raspberry Pi:
```bash
# Run the deployment script
sudo bash /tmp/deploy.sh

# The script will:
# - Install all dependencies
# - Clone repositories
# - Build backend and frontend
# - Set up database
# - Configure nginx
# - Install systemd service
# - Start the application
```

### 4. Access LacyLights

Once deployment is complete, access LacyLights at:
- `http://lacylights.local` (if hostname is set to lacylights)
- `http://[raspberry-pi-ip-address]` (IP shown at end of deployment)

## Advanced Deployment Options

### Custom Branch Deployment

Deploy from a specific branch:
```bash
BACKEND_BRANCH=develop FRONTEND_BRANCH=feature-xyz sudo bash /tmp/deploy.sh
```

### Custom User

Deploy with a different user (default is `pi`):
```bash
PI_USER=lacylights sudo bash /tmp/deploy.sh
```

## Post-Deployment Configuration

### Enable Auto-Updates (Optional)

To enable automatic pull-based updates:
```bash
sudo /opt/lacylights/backend/scripts/setup-auto-update.sh
```

This will:
- Set up a cron job for automatic updates
- Configure backup and rollback procedures
- Run tests before applying updates

### Configure Art-Net Network

Edit the backend environment file:
```bash
sudo nano /opt/lacylights/backend/.env
```

Set the Art-Net broadcast address:
```
ARTNET_ENABLED=true
ARTNET_BROADCAST=192.168.1.255  # Your subnet broadcast address
```

Restart the service:
```bash
sudo systemctl restart lacylights
```

## System Architecture

### Directory Structure
```
/opt/lacylights/
├── backend/              # Backend Node.js application
├── frontend/             # Frontend static files
└── frontend-src/         # Frontend source (for updates)

/var/lib/lacylights/
├── db.sqlite            # SQLite database
└── logs/                # Application logs

/etc/lacylights/
└── update.conf          # Auto-update configuration (if enabled)
```

### Services
- **Backend**: `systemd` service `lacylights.service`
- **Web Server**: `nginx` serving frontend and proxying GraphQL
- **Database**: SQLite at `/var/lib/lacylights/db.sqlite`

### Ports
- **80**: HTTP (nginx serving frontend + GraphQL proxy)
- **4000**: Backend GraphQL (internal, proxied by nginx)

## Monitoring and Logs

### View Backend Logs
```bash
# Real-time logs
sudo journalctl -u lacylights -f

# Last 100 lines
sudo journalctl -u lacylights -n 100

# Logs from today
sudo journalctl -u lacylights --since today
```

### View nginx Logs
```bash
# Access log
sudo tail -f /var/log/nginx/access.log

# Error log
sudo tail -f /var/log/nginx/error.log
```

### Check Service Status
```bash
# Backend service
sudo systemctl status lacylights

# nginx
sudo systemctl status nginx

# Database
sqlite3 /var/lib/lacylights/db.sqlite "SELECT COUNT(*) FROM Project;"
```

## Maintenance

### Manual Update

To manually update LacyLights:
```bash
# Re-run the deployment script
sudo bash /opt/lacylights/backend/deploy/deploy.sh

# Or run the auto-update script manually
sudo /opt/lacylights/backend/scripts/auto-update.sh
```

### Restart Services
```bash
# Restart backend
sudo systemctl restart lacylights

# Restart nginx
sudo systemctl restart nginx

# Restart both
sudo systemctl restart lacylights nginx
```

### Backup Database
```bash
# Create backup
sudo cp /var/lib/lacylights/db.sqlite /var/lib/lacylights/db.sqlite.backup

# With timestamp
sudo cp /var/lib/lacylights/db.sqlite \
  /var/lib/lacylights/db.sqlite.$(date +%Y%m%d_%H%M%S)
```

### Restore Database
```bash
# Stop service
sudo systemctl stop lacylights

# Restore backup
sudo cp /var/lib/lacylights/db.sqlite.backup /var/lib/lacylights/db.sqlite

# Start service
sudo systemctl start lacylights
```

## Troubleshooting

### Service Won't Start

Check logs:
```bash
sudo journalctl -u lacylights -n 50
```

Common issues:
- **Database locked**: Another process is using the database
- **Port 4000 in use**: Another service is using port 4000
- **Permission denied**: Check file ownership in `/var/lib/lacylights`

### Frontend Not Loading

Check nginx:
```bash
sudo nginx -t                    # Test config
sudo systemctl status nginx      # Check status
sudo tail -f /var/log/nginx/error.log  # View errors
```

### GraphQL Not Responding

Check if backend is running:
```bash
curl http://localhost:4000/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

### Database Issues

Check database:
```bash
# Verify database exists
ls -lh /var/lib/lacylights/db.sqlite

# Check database integrity
sqlite3 /var/lib/lacylights/db.sqlite "PRAGMA integrity_check;"

# View schema
sqlite3 /var/lib/lacylights/db.sqlite ".schema"
```

## Performance Optimization

### Memory Usage

LacyLights is optimized for Raspberry Pi with:
- SQLite (~50MB vs PostgreSQL ~200MB)
- No Redis cache
- Static frontend (no SSR overhead)
- Expected total footprint: ~350MB RAM

Monitor memory:
```bash
# Overall system memory
free -h

# Process memory
sudo systemctl status lacylights | grep Memory

# Detailed process info
ps aux | grep node
```

### CPU Usage

Art-Net transmission runs at:
- 44Hz when active (during scene changes/fades)
- 1Hz when idle (keep-alive only)

Monitor CPU:
```bash
# System overview
htop

# Service CPU
sudo systemctl status lacylights | grep CPU
```

## Network Configuration

### Static IP (Recommended)

Set a static IP for reliable access:
```bash
sudo nano /etc/dhcpcd.conf
```

Add:
```
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1
```

Restart networking:
```bash
sudo systemctl restart dhcpcd
```

### mDNS (Automatic)

Raspberry Pi OS includes Avahi for `.local` hostname resolution.

Test:
```bash
# From another machine
ping lacylights.local
```

## Security Considerations

### Firewall (Optional)

For production use, consider enabling a firewall:
```bash
sudo apt-get install ufw
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw enable
```

### SSH Hardening

Consider:
- Changing SSH port
- Disabling password authentication (use keys only)
- Installing fail2ban

### Updates

Keep system updated:
```bash
sudo apt-get update && sudo apt-get upgrade -y
```

## Support and Documentation

- Backend repository: https://github.com/bbernstein/lacylights-node
- Frontend repository: https://github.com/bbernstein/lacylights-fe
- MCP Server: https://github.com/bbernstein/lacylights-mcp
- Main documentation: https://github.com/bbernstein/lacylights

## License

See LICENSE file in each repository.
