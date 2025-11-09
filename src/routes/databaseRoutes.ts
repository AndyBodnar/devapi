import { Router } from 'express';
import {
  getTables,
  getTableSchema,
  getTableData,
  executeQuery,
  deleteRow,
  getDatabaseStats
} from '../controllers/databaseController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// All database routes require admin authentication
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all tables
router.get('/tables', getTables);

// Get database statistics
router.get('/stats', getDatabaseStats);

// Get table schema
router.get('/tables/:tableName/schema', getTableSchema);

// Get table data
router.get('/tables/:tableName/data', getTableData);

// Execute SQL query
router.post('/query', executeQuery);

// Delete row from table
router.delete('/tables/:tableName/rows', deleteRow);

export default router;
