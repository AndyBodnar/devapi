import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';

const router = Router();

// POST /api/hauling/analytics - Track analytics event
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { eventName, eventData, appVersion, platform } = req.body;

    if (!eventName) {
      res.status(400).json({ error: 'Event name is required' });
      return;
    }

    await haulingDB.analyticsEvent.create({
      data: {
        userId,
        eventName,
        eventData: eventData || {},
        appVersion,
        platform
      }
    });

    res.json({ success: true, message: 'Event tracked' });
  } catch (error) {
    console.error('Error tracking analytics:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// GET /api/hauling/analytics/dashboard - Get dashboard stats (admin only)
router.get('/dashboard', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const [
      totalJobs,
      pendingJobs,
      inProgressJobs,
      completedJobs,
      activeDrivers,
      totalErrors,
      openIssues
    ] = await Promise.all([
      haulingDB.job.count(),
      haulingDB.job.count({ where: { status: 'pending' } }),
      haulingDB.job.count({ where: { status: 'in_progress' } }),
      haulingDB.job.count({ where: { status: 'completed' } }),
      haulingDB.deviceStatus.count({
        where: {
          lastSeen: { gte: new Date(Date.now() - 5 * 60 * 1000) }
        }
      }),
      haulingDB.errorLog.count({ where: { resolved: false } }),
      haulingDB.reportedIssue.count({ where: { status: { in: ['new', 'in_progress'] } } })
    ]);

    const stats = {
      jobs: {
        total: totalJobs,
        pending: pendingJobs,
        inProgress: inProgressJobs,
        completed: completedJobs
      },
      activeDrivers,
      unresolvedErrors: totalErrors,
      openIssues
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// GET /api/hauling/analytics/revenue - Get revenue analytics
router.get('/revenue', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { period = '30' } = req.query; // days
    const days = parseInt(period as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get completed jobs with revenue data
    const completedJobs = await haulingDB.job.findMany({
      where: {
        status: 'completed',
        createdAt: { gte: startDate }
      },
      select: {
        id: true,
        price: true,
        createdAt: true,
        completedAt: true
      }
    });

    // Calculate totals
    const totalRevenue = completedJobs.reduce((sum, job) => sum + (parseFloat(job.price || '0')), 0);
    const averageJobValue = completedJobs.length > 0 ? totalRevenue / completedJobs.length : 0;

    // Group by day for chart
    const revenueByDay = completedJobs.reduce((acc, job) => {
      const date = job.completedAt?.toISOString().split('T')[0] || job.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { date, revenue: 0, jobs: 0 };
      }
      acc[date].revenue += parseFloat(job.price || '0');
      acc[date].jobs += 1;
      return acc;
    }, {} as Record<string, { date: string; revenue: number; jobs: number }>);

    const chartData = Object.values(revenueByDay).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    res.json({
      success: true,
      data: {
        totalRevenue: totalRevenue.toFixed(2),
        averageJobValue: averageJobValue.toFixed(2),
        totalJobs: completedJobs.length,
        chartData
      }
    });
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
});

// GET /api/hauling/analytics/drivers - Get driver performance metrics
router.get('/drivers', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { period = '30' } = req.query; // days
    const days = parseInt(period as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all drivers with their job counts
    const drivers = await haulingDB.user.findMany({
      where: { role: 'DRIVER' },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true
      }
    });

    const driverMetrics = await Promise.all(
      drivers.map(async (driver) => {
        const [totalJobs, completedJobs, inProgressJobs] = await Promise.all([
          haulingDB.job.count({
            where: {
              assignedDriverId: driver.id,
              createdAt: { gte: startDate }
            }
          }),
          haulingDB.job.count({
            where: {
              assignedDriverId: driver.id,
              status: 'completed',
              createdAt: { gte: startDate }
            }
          }),
          haulingDB.job.count({
            where: {
              assignedDriverId: driver.id,
              status: 'in_progress'
            }
          })
        ]);

        // Get revenue for this driver
        const driverJobs = await haulingDB.job.findMany({
          where: {
            assignedDriverId: driver.id,
            status: 'completed',
            createdAt: { gte: startDate }
          },
          select: { price: true }
        });

        const revenue = driverJobs.reduce((sum, job) => sum + parseFloat(job.price || '0'), 0);

        // Calculate completion rate
        const completionRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

        return {
          driverId: driver.id,
          driverName: `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || driver.username,
          totalJobs,
          completedJobs,
          inProgressJobs,
          revenue: revenue.toFixed(2),
          completionRate: completionRate.toFixed(1)
        };
      })
    );

    // Sort by total jobs descending
    driverMetrics.sort((a, b) => b.totalJobs - a.totalJobs);

    res.json({ success: true, data: driverMetrics });
  } catch (error) {
    console.error('Error fetching driver analytics:', error);
    res.status(500).json({ error: 'Failed to fetch driver analytics' });
  }
});

// GET /api/hauling/analytics/jobs-timeline - Get jobs over time for charts
router.get('/jobs-timeline', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { period = '30' } = req.query; // days
    const days = parseInt(period as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const jobs = await haulingDB.job.findMany({
      where: {
        createdAt: { gte: startDate }
      },
      select: {
        id: true,
        status: true,
        createdAt: true
      }
    });

    // Group by day and status
    const timeline = jobs.reduce((acc, job) => {
      const date = job.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = {
          date,
          total: 0,
          pending: 0,
          in_progress: 0,
          completed: 0,
          cancelled: 0
        };
      }
      acc[date].total += 1;
      if (job.status === 'pending') acc[date].pending += 1;
      else if (job.status === 'in_progress') acc[date].in_progress += 1;
      else if (job.status === 'completed') acc[date].completed += 1;
      else if (job.status === 'cancelled') acc[date].cancelled += 1;
      return acc;
    }, {} as Record<string, any>);

    const chartData = Object.values(timeline).sort((a: any, b: any) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    res.json({ success: true, data: chartData });
  } catch (error) {
    console.error('Error fetching jobs timeline:', error);
    res.status(500).json({ error: 'Failed to fetch jobs timeline' });
  }
});

// GET /api/hauling/analytics/events - Get analytics events with filtering
router.get('/events', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { eventName, limit = '100' } = req.query;
    const limitNum = parseInt(limit as string);

    const where: any = {};
    if (eventName) {
      where.eventName = eventName;
    }

    const events = await haulingDB.analyticsEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limitNum,
      select: {
        id: true,
        eventName: true,
        eventData: true,
        appVersion: true,
        platform: true,
        createdAt: true,
        userId: true
      }
    });

    // Get unique event names for filtering
    const eventNames = await haulingDB.analyticsEvent.findMany({
      distinct: ['eventName'],
      select: { eventName: true }
    });

    res.json({
      success: true,
      data: {
        events,
        availableEventNames: eventNames.map(e => e.eventName)
      }
    });
  } catch (error) {
    console.error('Error fetching analytics events:', error);
    res.status(500).json({ error: 'Failed to fetch analytics events' });
  }
});

export default router;
