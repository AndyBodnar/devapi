import { Router } from 'express';
import {
  createMetric,
  getMetrics,
  getMetricsSummary,
  getUserMetrics
} from '../controllers/metricsController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.post('/', createMetric);
router.get('/', adminMiddleware, getMetrics);
router.get('/summary', adminMiddleware, getMetricsSummary);
router.get('/user/:id', adminMiddleware, getUserMetrics);

export default router;
