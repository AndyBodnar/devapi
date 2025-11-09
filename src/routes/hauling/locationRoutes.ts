import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

// POST /api/hauling/location - Update driver location
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { latitude, longitude, accuracy, speed, jobId } = req.body;

    if (!latitude || !longitude) {
      res.status(400).json({ error: 'Latitude and longitude are required' });
      return;
    }

    await haulingDB.locationHistory.create({
      data: {
        driverId: userId,
        jobId: jobId ? BigInt(jobId) : null,
        latitude: new Decimal(latitude),
        longitude: new Decimal(longitude),
        accuracy: accuracy ? new Decimal(accuracy) : null,
        speed: speed ? new Decimal(speed) : null,
        recordedAt: new Date()
      }
    });

    res.json({ success: true, message: 'Location updated' });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// GET /api/hauling/location/:driverId - Get latest driver location (admin only)
router.get('/:driverId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { driverId } = req.params;

    const location = await haulingDB.locationHistory.findFirst({
      where: { driverId },
      orderBy: { recordedAt: 'desc' }
    });

    if (!location) {
      res.status(404).json({ error: 'No location found for driver' });
      return;
    }

    res.json({ success: true, data: location });
  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({ error: 'Failed to fetch location' });
  }
});

// GET /api/hauling/location/:driverId/history - Get location history
router.get('/:driverId/history', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { driverId } = req.params;
    const { jobId, startTime, endTime, limit } = req.query;

    // Drivers can only see their own history
    if (req.user?.userId !== driverId && req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const where: any = { driverId };

    if (jobId) where.jobId = BigInt(jobId as string);
    if (startTime) where.recordedAt = { ...where.recordedAt, gte: new Date(startTime as string) };
    if (endTime) where.recordedAt = { ...where.recordedAt, lte: new Date(endTime as string) };

    const history = await haulingDB.locationHistory.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: limit ? parseInt(limit as string) : 100
    });

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching location history:', error);
    res.status(500).json({ error: 'Failed to fetch location history' });
  }
});

// GET /api/hauling/location/active - Get all active driver locations (admin only)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const activeLocations = await haulingDB.locationHistory.groupBy({
      by: ['driverId'],
      _max: { recordedAt: true },
      where: {
        recordedAt: { gte: fiveMinutesAgo }
      }
    });

    const locations = await Promise.all(
      activeLocations.map(async ({ driverId }) => {
        return await haulingDB.locationHistory.findFirst({
          where: { driverId },
          orderBy: { recordedAt: 'desc' }
        });
      })
    );

    res.json({ success: true, data: locations.filter(Boolean) });
  } catch (error) {
    console.error('Error fetching active locations:', error);
    res.status(500).json({ error: 'Failed to fetch active locations' });
  }
});

export default router;
