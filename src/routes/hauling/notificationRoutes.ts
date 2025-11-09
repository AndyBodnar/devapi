import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';

const router = Router();

// GET /api/hauling/notifications - Get user's notifications
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { unreadOnly } = req.query;

    const where: any = { userId };
    if (unreadOnly === 'true') {
      where.readAt = null;
    }

    const notifications = await haulingDB.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PUT /api/hauling/notifications/:id/read - Mark notification as read
router.put('/:id/read', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const notification = await haulingDB.notification.findUnique({
      where: { id }
    });

    if (!notification || notification.userId !== userId) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    const updated = await haulingDB.notification.update({
      where: { id },
      data: { readAt: new Date() }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// PUT /api/hauling/notifications/mark-all-read - Mark all as read
router.put('/mark-all-read', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await haulingDB.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() }
    });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// POST /api/hauling/notifications/send - Send notification (admin only)
router.post('/send', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { userId, type, title, body, data } = req.body;

    if (!userId || !title || !body) {
      res.status(400).json({ error: 'userId, title, and body are required' });
      return;
    }

    const notification = await haulingDB.notification.create({
      data: {
        userId,
        type: type || 'system',
        title,
        body,
        data: data || {}
      }
    });

    res.json({ success: true, data: notification });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

export default router;
