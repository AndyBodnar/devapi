import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Generate a secure random password
const generatePassword = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
};

// Validate database name (alphanumeric and underscores only)
const isValidDatabaseName = (name: string): boolean => {
  return /^[a-zA-Z0-9_]+$/.test(name);
};

// List all databases (excluding system databases)
export const listDatabases = async (req: Request, res: Response) => {
  try {
    const databases = await prisma.$queryRaw<Array<{ datname: string; pg_database_size: bigint }>>`
      SELECT
        datname,
        pg_database_size(datname) as pg_database_size
      FROM pg_database
      WHERE datistemplate = false
        AND datname NOT IN ('postgres', 'template0', 'template1')
      ORDER BY datname;
    `;

    res.json({
      databases: databases.map(db => ({
        name: db.datname,
        size: Number(db.pg_database_size)
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Create a new database with dedicated user
export const createDatabase = async (req: Request, res: Response) => {
  try {
    const { databaseName, description } = req.body;

    if (!databaseName || typeof databaseName !== 'string') {
      return res.status(400).json({ error: 'Database name is required' });
    }

    // Validate database name
    if (!isValidDatabaseName(databaseName)) {
      return res.status(400).json({
        error: 'Database name must contain only letters, numbers, and underscores'
      });
    }

    // Check if database already exists
    const existing = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = '${databaseName}') as exists`
    );

    if (existing[0].exists) {
      return res.status(409).json({ error: 'Database already exists' });
    }

    // Generate username and password
    const username = `${databaseName}_user`;
    const password = generatePassword();

    // Create database
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);

    // Create user
    await prisma.$executeRawUnsafe(
      `CREATE USER "${username}" WITH ENCRYPTED PASSWORD '${password}'`
    );

    // Grant privileges
    await prisma.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON DATABASE "${databaseName}" TO "${username}"`);

    // Store database metadata in devauth database
    await prisma.$executeRawUnsafe(`
      INSERT INTO database_registry (name, username, description, created_at)
      VALUES ($1, $2, $3, NOW())
    `, databaseName, username, description || null);

    // Generate connection string
    const connectionString = `postgresql://${username}:${password}@5.78.98.98:5432/${databaseName}`;

    res.json({
      success: true,
      database: {
        name: databaseName,
        username,
        password,
        connectionString,
        description
      },
      message: 'Database created successfully. IMPORTANT: Save the password - it cannot be retrieved later!'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Get database details with connection info
export const getDatabaseDetails = async (req: Request, res: Response) => {
  try {
    const { databaseName } = req.params;

    // Get database info from registry
    const dbInfo = await prisma.$queryRawUnsafe<Array<{
      name: string;
      username: string;
      description: string | null;
      created_at: Date;
    }>>(
      `SELECT name, username, description, created_at
       FROM database_registry
       WHERE name = $1`,
      databaseName
    );

    if (dbInfo.length === 0) {
      return res.status(404).json({ error: 'Database not found in registry' });
    }

    const db = dbInfo[0];

    // Get database size
    const sizeInfo = await prisma.$queryRaw<Array<{ size: string }>>`
      SELECT pg_size_pretty(pg_database_size(${databaseName})) as size;
    `;

    // Connection string without password
    const connectionString = `postgresql://${db.username}:******@5.78.98.98:5432/${db.name}`;

    res.json({
      database: {
        name: db.name,
        username: db.username,
        description: db.description,
        createdAt: db.created_at,
        size: sizeInfo[0].size,
        connectionString,
        host: '5.78.98.98',
        port: 5432
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Delete a database and its user
export const deleteDatabase = async (req: Request, res: Response) => {
  try {
    const { databaseName } = req.params;

    // Prevent deleting the main auth database
    if (databaseName === 'devauth' || databaseName === 'postgres') {
      return res.status(403).json({
        error: 'Cannot delete system or auth database'
      });
    }

    // Get username from registry
    const dbInfo = await prisma.$queryRawUnsafe<Array<{ username: string }>>(
      `SELECT username FROM database_registry WHERE name = $1`,
      databaseName
    );

    if (dbInfo.length === 0) {
      return res.status(404).json({ error: 'Database not found in registry' });
    }

    const username = dbInfo[0].username;

    // Terminate all connections to the database
    await prisma.$executeRawUnsafe(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${databaseName}'
        AND pid <> pg_backend_pid();
    `);

    // Drop database
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);

    // Drop user
    await prisma.$executeRawUnsafe(`DROP USER IF EXISTS "${username}"`);

    // Remove from registry
    await prisma.$executeRawUnsafe(
      `DELETE FROM database_registry WHERE name = $1`,
      databaseName
    );

    res.json({
      success: true,
      message: `Database '${databaseName}' and user '${username}' deleted successfully`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// List all databases from registry with details
export const getRegisteredDatabases = async (req: Request, res: Response) => {
  try {
    const databases = await prisma.$queryRawUnsafe<Array<{
      name: string;
      username: string;
      description: string | null;
      created_at: Date;
    }>>(
      `SELECT name, username, description, created_at
       FROM database_registry
       ORDER BY created_at DESC`
    );

    const databasesWithDetails = await Promise.all(
      databases.map(async (db) => {
        try {
          const sizeInfo = await prisma.$queryRaw<Array<{ size: string }>>`
            SELECT pg_size_pretty(pg_database_size(${db.name})) as size;
          `;

          return {
            name: db.name,
            username: db.username,
            description: db.description,
            createdAt: db.created_at,
            size: sizeInfo[0]?.size || 'N/A',
            connectionString: `postgresql://${db.username}:******@5.78.98.98:5432/${db.name}`
          };
        } catch (err) {
          return {
            name: db.name,
            username: db.username,
            description: db.description,
            createdAt: db.created_at,
            size: 'N/A',
            connectionString: `postgresql://${db.username}:******@5.78.98.98:5432/${db.name}`
          };
        }
      })
    );

    res.json({ databases: databasesWithDetails });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
