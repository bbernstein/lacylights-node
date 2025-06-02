-- PostgreSQL initialization script for LacyLights
-- This script sets up the database with proper extensions and initial configuration

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create additional database for testing if it doesn't exist
SELECT 'CREATE DATABASE lacylights_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'lacylights_test')\gexec

-- Set timezone
SET timezone = 'UTC';

-- Create initial admin user (will be used by the application)
-- Note: This is for development only, production should use proper authentication
DO $$
BEGIN
    -- Any additional setup can go here
    RAISE NOTICE 'LacyLights database initialized successfully';
END
$$;