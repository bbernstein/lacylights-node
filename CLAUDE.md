# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LacyLights Node.js Server is a professional stage lighting control system built with TypeScript, GraphQL, and Node.js. It provides real-time DMX512 control, scene management, and Art-Net broadcast capabilities for stage lighting operations.

## Development Commands

### Building and Running
- `npm run dev` - Start development server with hot reload (tsx watch)
- `npm run build` - Build for production (TypeScript compilation)
- `npm start` - Start production server in background
- `npm run stop` - Stop the production server

### Testing
- `npm test` - Run all tests (excludes healthcheck and project tests)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate full coverage report with HTML output
- `npm run test:coverage:summary` - Quick coverage summary (silent mode)
- Run a single test: `npx jest path/to/test.test.ts` or `npx jest -t "test name pattern"`

### Code Quality
- `npm run lint` - Run ESLint on all TypeScript files
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run type-check` - Run TypeScript compiler without emitting files
- `npm run check` - Run both linting and build (pre-commit check)

### Database Management
- `npm run db:generate` - Generate Prisma client (run after schema changes)
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio GUI

### Docker Operations
- `npm run docker:db` - Start PostgreSQL + Redis only (recommended for development)
- `npm run docker:dev` - Start database services and run dev server
- `npm run docker:up` - Start all Docker services
- `npm run docker:down` - Stop all services
- `npm run docker:clean` - Stop services and remove volumes
- `npm run docker:logs` - View container logs

## Architecture Overview

### Core Architecture Pattern

The server uses a **layered service architecture** with clear separation of concerns:

1. **GraphQL Layer** (`src/graphql/`) - API definition and resolvers
2. **Service Layer** (`src/services/`) - Business logic and DMX control
3. **Database Layer** (Prisma) - Data persistence and ORM

### Critical Services

#### DMXService (`src/services/dmx/index.ts`)
The heart of the lighting control system. Manages:
- Multiple DMX universes (512 channels each)
- Art-Net broadcast over UDP (44Hz default refresh rate)
- Adaptive transmission rate (switches to 1Hz idle when no changes)
- Channel override system for real-time control
- Active scene tracking

**Key Methods:**
- `setChannelValue(universe, channel, value)` - Set base DMX channel
- `setChannelOverride(universe, channel, value)` - Set temporary override
- `triggerChangeDetection()` - Force high-rate transmission
- `getUniverseOutput(universe)` - Get current output with overrides applied

#### FadeEngine (`src/services/fadeEngine.ts`)
Real-time fade engine running at 40Hz (25ms intervals):
- Smooth transitions between lighting states
- Multiple easing functions (LINEAR, CUBIC, SINE, EXPONENTIAL, S_CURVE)
- Concurrent fade management
- Maintains interpolated values to prevent fade discontinuities

**Integration:** Works directly with DMXService to update channel values during fades.

#### PlaybackService (`src/services/playbackService.ts`)
Cue list playback orchestration:
- Manages cue list state machines
- Coordinates between FadeEngine and DMXService
- Handles cue transitions with configurable fade times
- Follow cue timing support

#### PreviewService (`src/services/previewService.ts`)
Safe testing environment:
- Isolated DMX state per user session
- Preview before committing to live output
- Session-based channel overrides

### Database Schema (Prisma)

**Core Models:**
- `Project` - Top-level container for lighting setup
- `FixtureDefinition` - Reusable fixture types with modes
- `FixtureMode` - Different channel configurations per fixture
- `FixtureInstance` - Physical fixture placement with DMX addressing
- `InstanceChannel` - Flattened channel data per fixture instance
- `Scene` - Lighting states with fixture values
- `FixtureValue` - Channel data per fixture in a scene
- `CueList` - Ordered collection of cues
- `Cue` - Scene reference with fade timing and easing

**Important:** The system uses **fixture mode flattening** - when a fixture instance is created, channel definitions from the selected mode are denormalized into `InstanceChannel` records. This improves query performance and simplifies scene management.

### GraphQL API Structure

- **Queries** - Read operations for projects, fixtures, scenes, DMX output
- **Mutations** - Write operations for creating/updating entities, DMX control, playback
- **Subscriptions** - Real-time updates for DMX output, playback status, preview sessions

Key subscription: `dmxOutputChanged` - Broadcasts universe changes at high frequency during active scenes.

### Service Abstractions (`src/services/abstractions/`)

Testable service wrappers for external dependencies:
- `FileSystemService` - File I/O operations
- `HttpService` - HTTP requests
- `ArchiveService` - ZIP file handling
- `DatabaseService` - Prisma client wrapper
- `PathService` - Path manipulation

**Purpose:** Enable comprehensive unit testing without mocking Node.js built-ins.

### Entry Points and Initialization

- `src/index.ts` - Entry point, runs `main()` from `src/main.ts`
- `src/main.ts` - Application bootstrap, service initialization
- `src/server.ts` - Server class with dependency injection support
- `src/context.ts` - GraphQL context creation with Prisma client

**Startup sequence:**
1. Initialize DMXService (select Art-Net interface, start output loop)
2. Start FadeEngine (40Hz fade processing)
3. Create Express app + Apollo Server
4. Setup WebSocket server for subscriptions
5. Start HTTP server

## Testing Guidelines

### Test Organization
- Tests live alongside source files in `__tests__` directories
- Unit tests should use mocked dependencies
- Integration tests mock the database via `DatabaseService`
- Test setup in `src/test/setup.ts`

### Running Tests
Tests run in parallel (maxWorkers: 16) for performance. Database conflicts are avoided by mocking all database interactions in unit tests.

### Coverage Requirements
- Minimum 75% coverage required for all repositories
- Run `npm run test:coverage` to verify before committing
- Exclude patterns: `*.d.ts`, `__tests__/**`, `__mocks__/**`

## Art-Net Configuration

The system broadcasts DMX data via Art-Net UDP protocol:
- Default port: 6454
- Configurable broadcast address (selected at startup)
- Environment variables:
  - `ARTNET_BROADCAST` - Pre-select network interface (e.g., "192.168.1.255")
  - `ARTNET_ENABLED` - Set to "false" for testing without network output
  - `NON_INTERACTIVE` - Skip interface selection prompts

**Interface selection:** On startup, prompts for network interface unless `ARTNET_BROADCAST` is set. Options include localhost, unicast, subnet broadcast, or global broadcast.

## QLC+ Integration

The system supports importing and exporting QLC+ workspace files:
- `src/services/qlcFixtureLibrary.ts` - Fixture library management
- Import: Parse QLC+ XML and map to LacyLights fixtures
- Export: Generate QLC+ XML with fixture mappings
- Scripts: `npm run export:qlc`, `npm run mapping:qlc`

## Environment Variables

Key configuration (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 4000)
- `DMX_UNIVERSE_COUNT` - Number of universes (default: 4)
- `DMX_REFRESH_RATE` - Active transmission rate in Hz (default: 44)
- `DMX_IDLE_RATE` - Idle transmission rate in Hz (default: 1)
- `DMX_HIGH_RATE_DURATION` - Keep high rate for N ms after changes (default: 2000)

## Development Notes

### Fixture Mode Flattening
When working with fixtures, note that channel data is **denormalized** at instance creation time. This means:
- FixtureInstance has flattened fields: `modeName`, `channelCount`, `manufacturer`, `model`, `type`
- InstanceChannel stores channel definitions directly on the instance
- Changing a FixtureMode does NOT affect existing instances
- See `FIXTURE_MODE_FLATTENING_PLAN.md` for migration details

### DMX Timing and Performance
- The DMX service uses adaptive transmission rates to optimize network usage
- High rate (44Hz) during active scenes/fades
- Low rate (1Hz) when idle for keep-alive
- Dirty flag system tracks changed universes to minimize transmissions
- Timing drift monitoring can be configured via environment variables

### Real-Time Subscriptions
- WebSocket subscriptions are handled via `graphql-ws`
- PubSub system broadcasts DMX changes and playback updates
- Subscriptions are universe-specific to reduce client bandwidth

### Git Pre-Commit Hooks
- Husky + lint-staged configured for automatic linting
- ESLint runs on all staged `.ts` files before commit
- Run `npm run lint:fix` to auto-fix issues before committing