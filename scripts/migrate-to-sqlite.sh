#!/bin/bash

# SQLite Migration Script
# Migrates LacyLights database from PostgreSQL to SQLite

set -e

echo "=========================================="
echo "LacyLights PostgreSQL to SQLite Migration"
echo "=========================================="
echo ""

# Configuration
POSTGRES_URL="${POSTGRES_URL:-postgresql://lacylights:lacylights_dev_password@localhost:5432/lacylights}"
SQLITE_DB="${SQLITE_DB:-./lacylights.sqlite}"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"

# Check if source PostgreSQL is accessible
echo "Checking PostgreSQL connection..."
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql command not found. Please install PostgreSQL client tools."
    exit 1
fi

# Extract connection details from URL
DB_USER=$(echo $POSTGRES_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $POSTGRES_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $POSTGRES_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $POSTGRES_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $POSTGRES_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

export PGPASSWORD=$DB_PASS

echo "Testing PostgreSQL connection to $DB_HOST:$DB_PORT/$DB_NAME..."
if ! psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to PostgreSQL database"
    echo "URL: $POSTGRES_URL"
    exit 1
fi

echo "✓ PostgreSQL connection successful"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Export data from PostgreSQL
echo "Exporting data from PostgreSQL..."

# Get list of tables
TABLES=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';")

for table in $TABLES; do
    # Skip Prisma migration table
    if [ "$table" = "_prisma_migrations" ]; then
        continue
    fi

    echo "  Exporting table: $table"
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\COPY $table TO '$BACKUP_DIR/$table.csv' WITH CSV HEADER;"
done

echo "✓ Data exported to $BACKUP_DIR"
echo ""

# Update Prisma schema if not already done
echo "Checking Prisma schema..."
if grep -q 'provider = "postgresql"' prisma/schema.prisma; then
    echo "WARNING: Prisma schema still configured for PostgreSQL"
    echo "Please update prisma/schema.prisma to use SQLite provider"
    echo "  datasource db {"
    echo "    provider = \"sqlite\""
    echo "    url      = env(\"DATABASE_URL\")"
    echo "  }"
    exit 1
fi

echo "✓ Prisma schema configured for SQLite"
echo ""

# Remove existing SQLite database if it exists
if [ -f "$SQLITE_DB" ]; then
    echo "Backing up existing SQLite database..."
    cp "$SQLITE_DB" "$BACKUP_DIR/existing_sqlite.db"
    rm "$SQLITE_DB"
fi

# Create .env with SQLite configuration
echo "Configuring database URL for SQLite..."
if [ ! -f .env ]; then
    cp .env.example .env
fi

# Update DATABASE_URL in .env
if grep -q "^DATABASE_URL=" .env; then
    sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=\"file:$SQLITE_DB\"|" .env
else
    echo "DATABASE_URL=\"file:$SQLITE_DB\"" >> .env
fi

echo "✓ DATABASE_URL updated in .env"
echo ""

# Generate Prisma client
echo "Generating Prisma client for SQLite..."
npm run db:generate

# Run migrations
echo "Running Prisma migrations..."
npm run db:migrate

echo "✓ SQLite database schema created"
echo ""

# Import data to SQLite
echo "Importing data to SQLite..."

# Note: This is a simplified import. In production, you'd use Prisma client
# to properly import data to handle relationships and constraints
echo "  NOTE: Automated data import not yet implemented"
echo "  Data has been exported to: $BACKUP_DIR"
echo "  You can manually import using Prisma client or SQL"
echo ""

echo "=========================================="
echo "Migration Complete!"
echo "=========================================="
echo ""
echo "PostgreSQL data exported to: $BACKUP_DIR"
echo "SQLite database created at: $SQLITE_DB"
echo ""
echo "Next steps:"
echo "  1. Verify SQLite database: sqlite3 $SQLITE_DB '.tables'"
echo "  2. Import data if needed (custom import required)"
echo "  3. Start server: npm run dev"
echo "  4. Test application thoroughly"
echo ""
