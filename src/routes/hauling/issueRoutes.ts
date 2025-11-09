import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';

const router = Router();

// POST /api/hauling/issues - Report issue
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { description, category, priority } = req.body;

    if (!description) {
      res.status(400).json({ success: false, error: 'Description is required' });
      return;
    }

    const issue = await haulingDB.reportedIssue.create({
      data: {
        reporterId: userId,
        description,
        category: category || 'bug',
        priority: priority || 'medium',
        status: 'new'
      }
    });

    res.json({ success: true, data: issue });
  } catch (error) {
    console.error('Error reporting issue:', error);
    res.status(500).json({ success: false, error: 'Failed to report issue' });
  }
});

// GET /api/hauling/issues - Get issues
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const { status, category, priority } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;

    // Non-admins can only see their own issues
    if (userRole !== 'ADMIN') {
      where.reporterId = userId;
    }

    const issues = await haulingDB.reportedIssue.findMany({
      where,
      orderBy: { reportedAt: 'desc' }
    });

    res.json({ success: true, data: issues });
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch issues' });
  }
});

// GET /api/hauling/issues/:id - Get specific issue
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const issue = await haulingDB.reportedIssue.findUnique({
      where: { id: parseInt(id) }
    });

    if (!issue) {
      res.status(404).json({ success: false, error: 'Issue not found' });
      return;
    }

    res.json({ success: true, data: issue });
  } catch (error) {
    console.error('Error fetching issue:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch issue' });
  }
});

// PUT /api/hauling/issues/:id - Update issue (admin only)
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;

    if (userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { status, adminNotes, assignedTo } = req.body;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (status === 'resolved') updateData.resolvedAt = new Date();

    const issue = await haulingDB.reportedIssue.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({ success: true, data: issue });
  } catch (error) {
    console.error('Error updating issue:', error);
    res.status(500).json({ success: false, error: 'Failed to update issue' });
  }
});

export default router;
