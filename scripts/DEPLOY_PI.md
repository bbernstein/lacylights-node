# Raspberry Pi Deployment Guide

This guide explains how to deploy LacyLights Node.js server to a Raspberry Pi using GitHub releases.

## Overview

The deployment system uses **GitHub releases** instead of git cloning, similar to the LacyLights.app update mechanism. This approach:
- Downloads pre-packaged releases from GitHub
- Simplifies deployment (no git repository needed on Pi)
- Tracks installed version with `.lacylights-version` file
- Preserves `.env` configuration during updates
- Enables easy version rollback

## Prerequisites

1. **Raspberry Pi Setup**
   - Raspberry Pi (tested on Pi 5)
   - Raspberry Pi OS (Debian-based) installed
   - Network connectivity (Pi accessible via `lacylights.local` or specific IP)
   - SSH enabled on the Pi

2. **Local Machine Setup**
   - SSH key configured for passwordless login to Pi
   - Test SSH connection: `ssh pi@lacylights.local`

3. **GitHub Release**
   - A release must exist in the `bbernstein/lacylights-node` repository
   - Use the automated release workflow to create releases

## Quick Start

The easiest way to deploy is using the npm script:

```bash
npm run deploy:pi
```

This will:
1. Check SSH connection to the Pi
2. Install dependencies if needed (Node.js, Docker with compose plugin, jq)
3. Fetch the latest release from GitHub
4. Download and extract the release tarball
5. Install npm packages
6. Build the application
7. Start Docker services (PostgreSQL, Redis)
8. Run database migrations
9. Start the LacyLights server

## Custom Configuration

### Environment Variables

You can customize the deployment by setting environment variables:

```bash
# Deploy to a different host
PI_HOST=192.168.1.100 npm run deploy:pi

# Use a different user
PI_USER=myuser npm run deploy:pi

# Combine both
PI_HOST=192.168.1.100 PI_USER=myuser npm run deploy:pi
```

### Manual Deployment

If you need more control, you can run the deployment script directly:

```bash
bash scripts/deploy-to-pi.sh
```

The script will automatically:
1. Install missing dependencies (Node.js, Docker, jq)
2. Download the latest release from GitHub
3. Extract and deploy the release
4. Configure the environment
5. Build and start the server

### Configure Environment

After the first deployment, you may want to customize the `.env` file on the Pi:

```bash
ssh pi@lacylights.local
cd ~/lacylights-node
nano .env
```

Important settings for Pi:
- `NODE_ENV=production` - Run in production mode
- `NON_INTERACTIVE=true` - Skip interactive prompts

**Note:** Art-Net broadcast address is now configured via the Settings UI and persisted in the database.

## Post-Deployment

### Accessing the Server

Once deployed, the server will be accessible at:
- GraphQL API: `http://lacylights.local:4000/graphql`
- GraphQL Playground: `http://lacylights.local:4000/graphql`

### Useful Commands

```bash
# View server logs
ssh pi@lacylights.local 'cd ~/lacylights-node && tail -f server.log'

# Stop the server
ssh pi@lacylights.local 'cd ~/lacylights-node && npm run stop'

# Restart the server
ssh pi@lacylights.local 'cd ~/lacylights-node && npm run stop && npm start'

# Check Docker services
ssh pi@lacylights.local 'cd ~/lacylights-node && docker compose ps'

# View Docker logs
ssh pi@lacylights.local 'cd ~/lacylights-node && docker compose logs -f'

# SSH to the Pi
ssh pi@lacylights.local
```

### Managing the Server

The server runs as a background process. To manage it:

```bash
# SSH to the Pi
ssh pi@lacylights.local

# Navigate to the project
cd ~/lacylights-node

# Stop the server
npm run stop

# Start the server
npm start

# View logs
tail -f server.log

# Restart Docker services
docker compose restart

# Check installed version
cat .lacylights-version

# Restart the server
npm run stop
npm start
```

To deploy updates, use the deployment script from your local machine:

```bash
npm run deploy:pi
```

## Troubleshooting

### SSH Connection Issues

If you can't connect to the Pi:
1. Verify the Pi is on the network: `ping lacylights.local`
2. Check SSH is enabled on the Pi
3. Verify your SSH key: `ssh-add -l`
4. Try with IP instead of hostname: `PI_HOST=192.168.1.xxx npm run deploy:pi`

### Docker Permission Issues

If you get Docker permission errors:
1. The installation script adds your user to the `docker` group
2. You must log out and back in for this to take effect
3. Or run: `newgrp docker`

### Port Conflicts

If ports are already in use:
- PostgreSQL (5432)
- Redis (6379)
- Adminer (8080)
- LacyLights (4000)

Check what's using the ports:
```bash
ssh pi@lacylights.local 'sudo netstat -tulpn | grep :5432'
```

### Art-Net Not Working

1. Check the Art-Net broadcast address in the Settings UI
2. Try different broadcast addresses:
   - Global broadcast: `255.255.255.255`
   - Subnet broadcast: `192.168.1.255`
   - Unicast to specific device: `192.168.1.100`
3. Verify firewall settings on the Pi
4. Check that Art-Net is enabled in the Settings UI

## Updating the Deployment

### Automatic Updates

The deployment script automatically checks for new releases. To update to the latest version:

```bash
npm run deploy:pi
```

The script will:
1. Check the currently installed version (from `.lacylights-version`)
2. Fetch the latest release from GitHub
3. If a newer version is available, download and deploy it
4. If already running the latest version, skip the update

### Force Reinstall

If you need to force a reinstall of the current version:

```bash
ssh pi@lacylights.local 'rm ~/lacylights-node/.lacylights-version'
npm run deploy:pi
```

### Creating a New Release

To deploy new code to the Pi, create a release in GitHub:

1. **Using GitHub Actions** (recommended):
   - Go to Actions → Create Release → Run workflow
   - Select version bump type (patch/minor/major)
   - The workflow creates a tagged release automatically

2. **Manual release**:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   gh release create v1.0.1 --generate-notes
   ```

3. Deploy to Pi:
   ```bash
   npm run deploy:pi
   ```

## Security Notes

- The default `.env.example` uses development passwords
- Change `POSTGRES_PASSWORD` in production
- Set a strong `SESSION_SECRET`
- Consider using a firewall to restrict access
- Keep the Pi OS and packages updated

## Performance Considerations

- Raspberry Pi 5 is recommended for optimal performance
- Older Pi models may experience higher CPU usage during fades
- Monitor CPU temperature: `ssh pi@lacylights.local 'vcgencmd measure_temp'`
- Consider active cooling for continuous operation
