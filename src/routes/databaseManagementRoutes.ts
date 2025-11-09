import { Router } from 'express';
import {
  listDatabases,
  createDatabase,
  getDatabaseDetails,
  deleteDatabase,
  getRegisteredDatabases
} from '../controllers/databaseManagementController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// All database management routes require admin authentication
router.use(authMiddleware);
router.use(adminMiddleware);

// List all PostgreSQL databases
router.get('/list', listDatabases);

// Get registered databases with connection info
router.get('/registered', getRegisteredDatabases);

// Get specific database details
router.get('/:databaseName', getDatabaseDetails);

// Create new database with user
router.post('/create', createDatabase);

// Delete database and user
router.delete('/:databaseName', deleteDatabase);

export default router;
