import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';

const router = Router();

// POST /api/hauling/heartbeat - Update device status (keep-alive)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { appType, appVersion, deviceInfo } = req.body;

    await haulingDB.deviceStatus.upsert({
      where: { userId },
      update: {
        lastSeen: new Date(),
        appVersion,
        deviceInfo
      },
      create: {
        userId,
        appType: appType || 'mobile',
        appVersion,
        deviceInfo
      }
    });

    res.json({ success: true, message: 'Heartbeat recorded' });
  } catch (error) {
    console.error('Error recording heartbeat:', error);
    res.status(500).json({ error: 'Failed to record heartbeat' });
  }
});

// GET /api/hauling/heartbeat/status - Get online drivers (admin only)
router.get('/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const onlineDevices = await haulingDB.deviceStatus.findMany({
      where: {
        lastSeen: { gte: fiveMinutesAgo }
      },
      orderBy: { lastSeen: 'desc' }
    });

    res.json({ success: true, data: onlineDevices });
  } catch (error) {
    console.error('Error fetching device status:', error);
    res.status(500).json({ error: 'Failed to fetch device status' });
  }
});

export default router;
