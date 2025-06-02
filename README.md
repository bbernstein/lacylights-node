# LacyLights Node.js Server

A professional stage lighting control system built with Node.js, GraphQL, and TypeScript. This server provides real-time DMX control, scene management, and multi-user collaboration for stage lighting operations.

## Features

- **GraphQL API** - Modern API with real-time subscriptions
- **DMX Output** - Multi-universe DMX512 control with priority system
- **Scene Management** - Create, edit, and manage lighting scenes
- **Cue Lists** - Organize and playback lighting cues
- **Fixture Library** - Built-in and custom fixture definitions
- **Multi-User Collaboration** - Real-time collaboration with role-based permissions
- **Preview System** - Test changes before committing to live output
- **TypeScript** - Full type safety throughout the codebase

## Technology Stack

- **Node.js** - Runtime environment
- **TypeScript** - Type-safe JavaScript
- **Apollo Server** - GraphQL server with subscriptions
- **Prisma** - Database ORM and migrations
- **PostgreSQL** - Database
- **WebSocket** - Real-time subscriptions
- **Jest** - Testing framework

## Prerequisites

- Node.js 18.0.0 or higher
- PostgreSQL 13 or higher
- npm or yarn package manager

## Quick Start

### Option 1: Docker Setup (Recommended)

The easiest way to get started is using Docker, which will set up PostgreSQL and Redis automatically:

```bash
git clone <repository-url>
cd lacylights-node
npm install

# Start database and Redis with Docker
npm run docker:db

# Copy environment file (already configured for Docker)
cp .env.example .env

# Generate Prisma client and run migrations
npm run db:generate
npm run db:migrate

# Start development server
npm run dev
```

The server will start at `http://localhost:4000/graphql`

**Database Management:**
- PostgreSQL runs on `localhost:5432`
- Adminer (database GUI) available at `http://localhost:8080`
- Redis runs on `localhost:6379`

### Option 2: Manual Setup

If you prefer to set up your own PostgreSQL database:

```bash
git clone <repository-url>
cd lacylights-node
npm install
```

Copy the environment template and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your database configuration:

```env
DATABASE_URL="postgresql://your_user:your_password@localhost:5432/lacylights"
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
DMX_UNIVERSE_COUNT=4
DMX_REFRESH_RATE=44
SESSION_SECRET=your-session-secret-here
```

Then set up the database:

```bash
# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

## Docker Services

The project includes a complete Docker Compose setup with the following services:

- **PostgreSQL 15** - Main database with automatic initialization
- **Redis 7** - Session storage and caching (optional)
- **Adminer** - Web-based database administration tool

### Docker Usage

```bash
# Start all services in background
npm run docker:up

# Start only database services (recommended for development)
npm run docker:db

# View logs from all services
npm run docker:logs

# Stop all services
npm run docker:down

# Clean up (removes volumes and data)
npm run docker:clean
```

### Database Access

- **Application**: Uses connection string from `.env` file
- **Direct Connection**: `postgresql://lacylights:lacylights_dev_password@localhost:5432/lacylights`
- **Adminer GUI**: http://localhost:8080 (server: `postgres`, user: `lacylights`, password: `lacylights_dev_password`)

## Development

### Project Structure

```
lacylights-node/
├── src/
│   ├── graphql/
│   │   ├── resolvers/          # GraphQL resolvers
│   │   ├── schema.ts           # GraphQL schema definition
│   │   └── subscriptions.ts    # WebSocket setup
│   ├── services/
│   │   └── dmx/               # DMX output service
│   ├── context.ts             # GraphQL context
│   └── index.ts               # Application entry point
├── prisma/
│   └── schema.prisma          # Database schema
├── docs/                      # Documentation
└── tests/                     # Test files
```

### Available Scripts

```bash
# Development
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm start           # Start production server

# Database
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run database migrations
npm run db:studio    # Open Prisma Studio

# Docker Commands
npm run docker:up    # Start all Docker services
npm run docker:down  # Stop all Docker services
npm run docker:db    # Start only database services (PostgreSQL + Redis)
npm run docker:dev   # Start database services and run dev server
npm run docker:logs  # View Docker container logs
npm run docker:clean # Stop services and remove volumes

# Testing
npm test            # Run tests
npm run test:watch  # Run tests in watch mode

# Code Quality
npm run lint        # Run ESLint
npm run lint:fix    # Fix ESLint issues
```

### Database Schema

The system uses Prisma with PostgreSQL and includes these main entities:

- **Projects** - Top-level containers for lighting setups
- **Fixture Definitions** - Reusable fixture types with channel mappings
- **Fixture Instances** - Physical fixtures in projects
- **Scenes** - Lighting states with fixture values
- **Cue Lists** - Organized sequences of scenes
- **Users** - Authentication and authorization
- **Preview Sessions** - Safe testing environment

### GraphQL API

The GraphQL playground is available at `http://localhost:4000/graphql` when running in development mode.

Key query examples:

```graphql
# Get all projects
query {
  projects {
    id
    name
    fixtures {
      id
      name
      universe
      startChannel
    }
  }
}

# Create a new fixture instance
mutation {
  createFixtureInstance(input: {
    name: "Stage Left Par"
    definitionId: "fixture-def-id"
    projectId: "project-id"
    universe: 1
    startChannel: 1
  }) {
    id
    name
  }
}

# Subscribe to DMX output changes
subscription {
  dmxOutputChanged(universe: 1) {
    universe
    channels
  }
}
```

### DMX Output

The DMX service runs at the configured refresh rate (default 44Hz) and supports:

- Multiple universes (configurable)
- Channel value priority system
- Real-time output updates
- Hardware abstraction layer

To integrate with DMX hardware, extend the `DMXService` class in `src/services/dmx/index.ts`.

### Testing

Run the test suite:

```bash
npm test
```

Tests are organized by feature and include:
- Unit tests for business logic
- Integration tests for GraphQL resolvers
- Database tests with test fixtures

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for new functionality
5. Run tests: `npm test`
6. Check code quality: `npm run lint`
7. Commit your changes: `git commit -m 'Add amazing feature'`
8. Push to the branch: `git push origin feature/amazing-feature`
9. Open a Pull Request

### Production Deployment

#### Option 1: Docker Production

1. Build the Docker image:
   ```bash
   docker build -t lacylights-node .
   ```

2. Use production Docker Compose:
   ```bash
   # Create production environment file
   cp .env.docker .env.production
   # Edit .env.production with production values

   # Deploy with production settings
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

#### Option 2: Manual Production

1. Build the application:
   ```bash
   npm run build
   ```

2. Set production environment variables

3. Run database migrations:
   ```bash
   npm run db:migrate
   ```

4. Start the server:
   ```bash
   npm start
   ```

### Docker Health Checks

The application includes health checks for monitoring:

- **Application Health**: `GET /health` - Returns server status and uptime
- **Database Health**: Automatic PostgreSQL health checks in Docker
- **Redis Health**: Automatic Redis health checks in Docker

### Environment Variables

| Variable | Description | Default | Docker Value |
|----------|-------------|---------|--------------|
| `DATABASE_URL` | PostgreSQL connection string | Required | `postgresql://lacylights:lacylights_dev_password@localhost:5432/lacylights` |
| `PORT` | Server port | 4000 | 4000 |
| `NODE_ENV` | Environment mode | development | development |
| `CORS_ORIGIN` | Allowed CORS origin | http://localhost:3000 | http://localhost:3000 |
| `DMX_UNIVERSE_COUNT` | Number of DMX universes | 4 | 4 |
| `DMX_REFRESH_RATE` | DMX output refresh rate (Hz) | 44 | 44 |
| `SESSION_SECRET` | Session encryption secret | Required | Auto-generated for dev |
| `REDIS_URL` | Redis connection string | Optional | `redis://localhost:6379` |
| `DOCKER_MODE` | Running in Docker container | false | true |

### Docker Environment Files

- **`.env.example`** - Template for local development
- **`.env.docker`** - Pre-configured for Docker containers
- **`.env`** - Your local environment (copy from `.env.example`)

### API Documentation

For detailed API documentation, see the GraphQL schema at `src/graphql/schema.ts` or explore the interactive playground at `/graphql`.

### Hardware Integration

To connect DMX hardware:

1. Install appropriate DMX interface drivers
2. Extend the `DMXService.outputDMX()` method
3. Configure universe count and refresh rate
4. Test with preview sessions before going live

### Support

For questions, issues, or contributions:

- Open an issue on GitHub
- Check the documentation in `/docs`
- Review the PRD at `docs/lighting-control-prd.md`

## License

MIT License - see LICENSE file for details.