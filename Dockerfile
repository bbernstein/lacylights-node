# Multi-stage build for Node.js application
# Using Debian-based image for better Prisma/OpenSSL compatibility
FROM node:20-slim AS base

# Install dependencies only when needed
FROM base AS deps
# Install OpenSSL and ca-certificates for Prisma
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
# Install all dependencies first (including dev deps) to run prepare script
RUN npm ci
# Then remove dev dependencies
RUN npm prune --production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# Install all dependencies for building
RUN npm ci
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npx tsc

# Production image, copy all the files and run the application
FROM base AS runner
WORKDIR /app

# Install OpenSSL and ca-certificates for Prisma compatibility
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nextjs

# Copy the built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

USER nextjs

EXPOSE 4000

ENV PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/healthcheck.js || exit 1

CMD ["npm", "start"]