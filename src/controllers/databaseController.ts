import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get all tables in the database
export const getTables = async (req: Request, res: Response) => {
  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;

    res.json({
      tables: tables.map(t => t.tablename)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Get table schema/structure
export const getTableSchema = async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;

    const columns = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>>`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
      ORDER BY ordinal_position;
    `;

    res.json({ columns });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Get table data with pagination
export const getTableData = async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM "${tableName}"`
    );
    const total = Number(countResult[0].count);

    // Get data
    const data = await prisma.$queryRawUnsafe(
      `SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`
    );

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Execute SQL query (SELECT only for safety)
export const executeQuery = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Basic validation - only allow SELECT queries for safety
    const trimmedQuery = query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
      return res.status(403).json({
        error: 'Only SELECT queries are allowed for safety. Use table operations for modifications.'
      });
    }

    const result = await prisma.$queryRawUnsafe(query);

    res.json({
      success: true,
      data: result,
      rowCount: Array.isArray(result) ? result.length : 0
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Delete row from table
export const deleteRow = async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "${tableName}" WHERE id = $1`,
      id
    );

    res.json({
      success: true,
      message: 'Row deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Get database statistics
export const getDatabaseStats = async (req: Request, res: Response) => {
  try {
    // Get table sizes
    const tableSizes = await prisma.$queryRaw<Array<{
      tablename: string;
      row_count: bigint;
      total_size: string;
    }>>`
      SELECT
        schemaname || '.' || tablename AS tablename,
        n_live_tup AS row_count,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
    `;

    // Get database size
    const dbSize = await prisma.$queryRaw<Array<{ size: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size;
    `;

    res.json({
      databaseSize: dbSize[0].size,
      tables: tableSizes.map(t => ({
        name: t.tablename,
        rowCount: Number(t.row_count),
        size: t.total_size
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
