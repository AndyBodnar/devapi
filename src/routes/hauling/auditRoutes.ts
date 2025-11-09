import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';

const router = Router();

// POST /api/hauling/audit - Create audit log entry
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { action, entityType, entityId, changes, ipAddress, userAgent } = req.body;

    if (!action || !entityType) {
      res.status(400).json({ success: false, error: 'Action and entityType are required' });
      return;
    }

    const auditLog = await haulingDB.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        changes: changes || {},
        ipAddress,
        userAgent
      }
    });

    res.json({ success: true, data: auditLog });
  } catch (error) {
    console.error('Error creating audit log:', error);
    res.status(500).json({ success: false, error: 'Failed to create audit log' });
  }
});

// GET /api/hauling/audit - Get audit logs (admin only)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const {
      userId,
      action,
      entityType,
      startDate,
      endDate,
      limit = '100',
      offset = '0'
    } = req.query;

    const where: any = {};

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [logs, total] = await Promise.all([
      haulingDB.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        include: {
          user: {
            select: {
              username: true,
              email: true,
              role: true
            }
          }
        }
      }),
      haulingDB.auditLog.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        logs,
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

// GET /api/hauling/audit/entity/:entityType/:entityId - Get audit logs for specific entity
router.get('/entity/:entityType/:entityId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { entityType, entityId } = req.params;
    const { limit = '50' } = req.query;

    const logs = await haulingDB.auditLog.findMany({
      where: {
        entityType,
        entityId
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      include: {
        user: {
          select: {
            username: true,
            email: true,
            role: true
          }
        }
      }
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error fetching entity audit logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch entity audit logs' });
  }
});

// GET /api/hauling/audit/user/:userId - Get audit logs for specific user
router.get('/user/:userId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { limit = '50' } = req.query;

    // Users can see their own logs, admins can see all
    if (req.user?.userId !== userId && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    const logs = await haulingDB.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      include: {
        user: {
          select: {
            username: true,
            email: true,
            role: true
          }
        }
      }
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error fetching user audit logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user audit logs' });
  }
});

// GET /api/hauling/audit/stats - Get audit log statistics
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { period = '30' } = req.query; // days
    const days = parseInt(period as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [totalLogs, logsByAction, logsByEntityType, recentLogs] = await Promise.all([
      haulingDB.auditLog.count({
        where: { createdAt: { gte: startDate } }
      }),
      haulingDB.auditLog.groupBy({
        by: ['action'],
        where: { createdAt: { gte: startDate } },
        _count: true
      }),
      haulingDB.auditLog.groupBy({
        by: ['entityType'],
        where: { createdAt: { gte: startDate } },
        _count: true
      }),
      haulingDB.auditLog.findMany({
        where: { createdAt: { gte: startDate } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: {
            select: {
              username: true,
              role: true
            }
          }
        }
      })
    ]);

    const actionStats = logsByAction.reduce((acc, item) => {
      acc[item.action] = item._count;
      return acc;
    }, {} as Record<string, number>);

    const entityStats = logsByEntityType.reduce((acc, item) => {
      acc[item.entityType] = item._count;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: {
        totalLogs,
        actionStats,
        entityStats,
        recentLogs
      }
    });
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit stats' });
  }
});

// DELETE /api/hauling/audit/cleanup - Cleanup old audit logs (admin only)
router.delete('/cleanup', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { daysToKeep = '90' } = req.query;
    const days = parseInt(daysToKeep as string);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await haulingDB.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate }
      }
    });

    res.json({
      success: true,
      message: `Deleted ${result.count} audit logs older than ${days} days`
    });
  } catch (error) {
    console.error('Error cleaning up audit logs:', error);
    res.status(500).json({ success: false, error: 'Failed to cleanup audit logs' });
  }
});

export default router;
