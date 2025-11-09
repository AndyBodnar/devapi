-- Migration: Create database_registry table
-- Purpose: Track databases created through the dashboard

CREATE TABLE IF NOT EXISTS database_registry (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_database_registry_name ON database_registry(name);

-- Add comment
COMMENT ON TABLE database_registry IS 'Registry of databases created through the DevCollective dashboard';
