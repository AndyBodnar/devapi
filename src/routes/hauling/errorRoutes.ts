import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';

const router = Router();

// POST /api/hauling/errors - Log error
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { errorMessage, stackTrace, appVersion, deviceInfo, severity } = req.body;

    if (!errorMessage) {
      res.status(400).json({ error: 'Error message is required' });
      return;
    }

    const errorLog = await haulingDB.errorLog.create({
      data: {
        userId,
        errorMessage,
        stackTrace,
        appVersion,
        deviceInfo: deviceInfo || {},
        severity: severity || 'medium'
      }
    });

    res.json({ success: true, data: errorLog });
  } catch (error) {
    console.error('Error logging error:', error);
    res.status(500).json({ error: 'Failed to log error' });
  }
});

// GET /api/hauling/errors - Get error logs (admin only)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { resolved, severity, limit } = req.query;

    const where: any = {};
    if (resolved) where.resolved = resolved === 'true';
    if (severity) where.severity = severity;

    const errors = await haulingDB.errorLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit as string) : 100
    });

    res.json({ success: true, data: errors });
  } catch (error) {
    console.error('Error fetching error logs:', error);
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

// PUT /api/hauling/errors/:id/resolve - Mark error as resolved (admin only)
router.put('/:id/resolve', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { id } = req.params;

    const errorLog = await haulingDB.errorLog.update({
      where: { id: BigInt(id) },
      data: {
        resolved: true
      }
    });

    res.json({ success: true, data: errorLog });
  } catch (error) {
    console.error('Error resolving error log:', error);
    res.status(500).json({ error: 'Failed to resolve error log' });
  }
});

export default router;
