# Raspberry Pi Deployment Guide

This guide explains how to deploy LacyLights Node.js server to a Raspberry Pi.

## Prerequisites

1. **Raspberry Pi Setup**
   - Raspberry Pi (tested on Pi 5)
   - Raspberry Pi OS (Debian-based) installed
   - Network connectivity (Pi accessible via `rasp.local` or specific IP)
   - SSH enabled on the Pi

2. **Local Machine Setup**
   - SSH key configured for passwordless login to Pi
   - Git configured with access to the repository
   - Test SSH connection: `ssh pi@rasp.local`

## Quick Start

The easiest way to deploy is using the npm script:

```bash
npm run deploy:pi
```

This will:
1. Check SSH connection to the Pi
2. Install dependencies if needed (Node.js, Docker, docker-compose)
3. Clone the repository branch
4. Install npm packages
5. Build the application
6. Start Docker services (PostgreSQL, Redis)
7. Run database migrations
8. Start the LacyLights server

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

If you need more control, you can run the scripts separately:

1. **Install Dependencies** (first time only):
   ```bash
   bash scripts/deploy-to-pi.sh
   ```
   The script will detect missing dependencies and install them automatically.

2. **Configure Environment**:
   After the first deployment, you may want to customize the `.env` file on the Pi:
   ```bash
   ssh pi@rasp.local
   cd ~/lacylights-node
   nano .env
   ```

   Important settings for Pi:
   - `NODE_ENV=production` - Run in production mode
   - `NON_INTERACTIVE=true` - Skip interactive prompts
   - `ARTNET_BROADCAST=255.255.255.255` - Broadcast to all interfaces
   - Or set specific IP: `ARTNET_BROADCAST=192.168.1.255`

3. **Redeploy After Changes**:
   ```bash
   npm run deploy:pi
   ```

## Post-Deployment

### Accessing the Server

Once deployed, the server will be accessible at:
- GraphQL API: `http://rasp.local:4000/graphql`
- GraphQL Playground: `http://rasp.local:4000/graphql`

### Useful Commands

```bash
# View server logs
ssh pi@rasp.local 'cd ~/lacylights-node && tail -f server.log'

# Stop the server
ssh pi@rasp.local 'cd ~/lacylights-node && npm run stop'

# Restart the server
ssh pi@rasp.local 'cd ~/lacylights-node && npm run stop && npm start'

# Check Docker services
ssh pi@rasp.local 'cd ~/lacylights-node && docker-compose ps'

# View Docker logs
ssh pi@rasp.local 'cd ~/lacylights-node && docker-compose logs -f'

# SSH to the Pi
ssh pi@rasp.local
```

### Managing the Server

The server runs as a background process. To manage it:

```bash
# SSH to the Pi
ssh pi@rasp.local

# Navigate to the project
cd ~/lacylights-node

# Stop the server
npm run stop

# Start the server
npm start

# View logs
tail -f server.log

# Restart Docker services
docker-compose restart

# Pull latest changes and redeploy
git pull origin feature/raspberry-pi-deployment
npm install
npm run build
docker-compose restart
npm run stop
npm start
```

## Troubleshooting

### SSH Connection Issues

If you can't connect to the Pi:
1. Verify the Pi is on the network: `ping rasp.local`
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
ssh pi@rasp.local 'sudo netstat -tulpn | grep :5432'
```

### Art-Net Not Working

1. Check the network interface configuration in `.env`
2. Try broadcast to all: `ARTNET_BROADCAST=255.255.255.255`
3. Or use subnet broadcast: `ARTNET_BROADCAST=192.168.1.255`
4. Verify firewall settings on the Pi

## Updating the Deployment

To update the Pi with the latest changes:

1. Push changes to the branch:
   ```bash
   git push origin feature/raspberry-pi-deployment
   ```

2. Redeploy:
   ```bash
   npm run deploy:pi
   ```

The script will pull the latest changes and redeploy automatically.

## Security Notes

- The default `.env.example` uses development passwords
- Change `POSTGRES_PASSWORD` in production
- Set a strong `SESSION_SECRET`
- Consider using a firewall to restrict access
- Keep the Pi OS and packages updated

## Performance Considerations

- Raspberry Pi 5 is recommended for optimal performance
- Older Pi models may experience higher CPU usage during fades
- Monitor CPU temperature: `ssh pi@rasp.local 'vcgencmd measure_temp'`
- Consider active cooling for continuous operation
