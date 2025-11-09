import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

const createMetricSchema = z.object({
  type: z.string().min(1),
  value: z.number().optional(),
  metadata: z.record(z.any()).optional()
});

// Create a metric
export const createMetric = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = createMetricSchema.parse(req.body);

    const metric = await prisma.metric.create({
      data: {
        userId: req.user.userId,
        type: data.type,
        value: data.value,
        metadata: data.metadata
      }
    });

    res.status(201).json({ message: 'Metric created', metric });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    console.error('Create metric error:', error);
    res.status(500).json({ error: 'Failed to create metric' });
  }
};

// Get metrics (with filters)
export const getMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '50',
      type,
      userId,
      startDate,
      endDate
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};

    if (type) where.type = type;
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [metrics, total] = await Promise.all([
      prisma.metric.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true
            }
          }
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.metric.count({ where })
    ]);

    res.json({
      metrics,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Get metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
};

// Get metrics summary/analytics
export const getMetricsSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, userId } = req.query;

    const where: any = {};
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    // Get total counts by type
    const metricsByType = await prisma.metric.groupBy({
      by: ['type'],
      where,
      _count: {
        id: true
      },
      _sum: {
        value: true
      },
      _avg: {
        value: true
      }
    });

    // Get total metrics count
    const totalMetrics = await prisma.metric.count({ where });

    // Get metrics over time (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const metricsOverTime = await prisma.$queryRaw`
      SELECT
        DATE(created_at) as date,
        type,
        COUNT(*) as count
      FROM "Metric"
      WHERE created_at >= ${sevenDaysAgo}
      GROUP BY DATE(created_at), type
      ORDER BY DATE(created_at) DESC
    `;

    res.json({
      summary: {
        total: totalMetrics,
        byType: metricsByType
      },
      timeline: metricsOverTime
    });
  } catch (error) {
    console.error('Get metrics summary error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics summary' });
  }
};

// Get user-specific metrics
export const getUserMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const metrics = await prisma.metric.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const summary = await prisma.metric.groupBy({
      by: ['type'],
      where: { userId: id },
      _count: {
        id: true
      }
    });

    res.json({
      metrics,
      summary
    });
  } catch (error) {
    console.error('Get user metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch user metrics' });
  }
};
