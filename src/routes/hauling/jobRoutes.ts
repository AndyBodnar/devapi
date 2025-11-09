import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';

const router = Router();

// GET /api/hauling/jobs
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let jobs;
    if (userRole === 'ADMIN') {
      jobs = await haulingDB.job.findMany({
        orderBy: { createdAt: 'desc' },
        include: { timeLogs: true, attachments: true }
      });
    } else {
      jobs = await haulingDB.job.findMany({
        where: { OR: [{ driverId: userId }, { assignedTo: userId }] },
        orderBy: { createdAt: 'desc' },
        include: { timeLogs: true, attachments: true }
      });
    }

    res.json({ success: true, data: jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// POST /api/hauling/jobs
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { pickupAddress, deliveryAddress } = req.body;
    if (!pickupAddress || !deliveryAddress) {
      res.status(400).json({ error: 'Addresses are required' });
      return;
    }

    const job = await haulingDB.job.create({
      data: { ...req.body, status: 'pending' }
    });

    res.json({ success: true, data: job });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// PUT /api/hauling/jobs/:id/status
router.put('/:id/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const job = await haulingDB.job.update({
      where: { id: BigInt(id) },
      data: { status }
    });

    res.json({ success: true, data: job });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

export default router;
