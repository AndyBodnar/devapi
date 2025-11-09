import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';

const router = Router();

// GET /api/hauling/database/tables - List all tables
router.get('/tables', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    // Query to get all tables in hauling48 database
    const tables = await haulingDB.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    res.json({ success: true, data: tables });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tables' });
  }
});

// GET /api/hauling/database/tables/:name/schema - Get table schema
router.get('/tables/:name/schema', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { name } = req.params;

    const columns = await haulingDB.$queryRaw`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = ${name}
      ORDER BY ordinal_position
    `;

    res.json({ success: true, data: columns });
  } catch (error) {
    console.error('Error fetching table schema:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch table schema' });
  }
});

// GET /api/hauling/database/tables/:name/rows - Browse table data
router.get('/tables/:name/rows', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { name } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    // Sanitize table name to prevent SQL injection
    const validTablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!validTablePattern.test(name)) {
      res.status(400).json({ success: false, error: 'Invalid table name' });
      return;
    }

    const rows = await haulingDB.$queryRawUnsafe(
      `SELECT * FROM ${name} LIMIT ${parseInt(limit as string)} OFFSET ${parseInt(offset as string)}`
    );

    const countResult = await haulingDB.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM ${name}`
    ) as any[];

    const totalCount = parseInt(countResult[0]?.count || '0');

    res.json({ 
      success: true, 
      data: {
        rows,
        totalCount,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    console.error('Error fetching table rows:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch table rows' });
  }
});

// GET /api/hauling/database/tables/:name/stats - Get table stats
router.get('/tables/:name/stats', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { name } = req.params;

    // Sanitize table name
    const validTablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!validTablePattern.test(name)) {
      res.status(400).json({ success: false, error: 'Invalid table name' });
      return;
    }

    const countResult = await haulingDB.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM ${name}`
    ) as any[];

    const sizeResult = await haulingDB.$queryRaw`
      SELECT pg_size_pretty(pg_total_relation_size(${name}::regclass)) as size
    `;

    res.json({ 
      success: true, 
      data: {
        rowCount: parseInt(countResult[0]?.count || '0'),
        size: (sizeResult as any)[0]?.size
      }
    });
  } catch (error) {
    console.error('Error fetching table stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch table stats' });
  }
});

// POST /api/hauling/database/query - Execute read-only query
router.post('/query', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { query } = req.body;

    if (!query) {
      res.status(400).json({ success: false, error: 'Query is required' });
      return;
    }

    // Only allow SELECT queries for safety
    const trimmedQuery = query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
      res.status(400).json({ 
        success: false, 
        error: 'Only SELECT queries are allowed for safety' 
      });
      return;
    }

    const result = await haulingDB.$queryRawUnsafe(query);

    res.json({ 
      success: true, 
      data: {
        rows: result,
        rowCount: Array.isArray(result) ? result.length : 0
      }
    });
  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to execute query' 
    });
  }
});

export default router;
