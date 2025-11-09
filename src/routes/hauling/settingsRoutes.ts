import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';

const router = Router();

// GET /api/hauling/settings - Get all settings (admin only)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const settings = await haulingDB.appSettings.findMany({
      orderBy: { key: 'asc' }
    });

    // Convert to key-value object
    const settingsObj = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, any>);

    res.json({ success: true, data: settingsObj });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

// GET /api/hauling/settings/:key - Get specific setting
router.get('/:key', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params;

    const setting = await haulingDB.appSettings.findUnique({
      where: { key }
    });

    if (!setting) {
      res.status(404).json({ success: false, error: 'Setting not found' });
      return;
    }

    res.json({ success: true, data: setting });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch setting' });
  }
});

// PUT /api/hauling/settings/:key - Update setting (admin only)
router.put('/:key', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      res.status(400).json({ success: false, error: 'Value is required' });
      return;
    }

    const setting = await haulingDB.appSettings.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value }
    });

    res.json({ success: true, data: setting });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ success: false, error: 'Failed to update setting' });
  }
});

// POST /api/hauling/settings/bulk - Bulk update settings (admin only)
router.post('/bulk', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ success: false, error: 'Settings object is required' });
      return;
    }

    // Update each setting
    const updates = Object.entries(settings).map(([key, value]) =>
      haulingDB.appSettings.upsert({
        where: { key },
        update: { value, updatedAt: new Date() },
        create: { key, value }
      })
    );

    await Promise.all(updates);

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error bulk updating settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// DELETE /api/hauling/settings/:key - Delete setting (admin only)
router.delete('/:key', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { key } = req.params;

    await haulingDB.appSettings.delete({
      where: { key }
    });

    res.json({ success: true, message: 'Setting deleted successfully' });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ success: false, error: 'Failed to delete setting' });
  }
});

// GET /api/hauling/settings/users/:userId/preferences - Get user preferences
router.get('/users/:userId/preferences', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    // Only allow users to get their own preferences or admin to get any
    if (req.user?.userId !== userId && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    const user = await haulingDB.user.findUnique({
      where: { id: userId },
      select: {
        notificationsEnabled: true,
        theme: true,
        language: true
      }
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user preferences' });
  }
});

// PUT /api/hauling/settings/users/:userId/preferences - Update user preferences
router.put('/users/:userId/preferences', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { notificationsEnabled, theme, language } = req.body;

    // Only allow users to update their own preferences or admin to update any
    if (req.user?.userId !== userId && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    const updateData: any = {};
    if (notificationsEnabled !== undefined) updateData.notificationsEnabled = notificationsEnabled;
    if (theme !== undefined) updateData.theme = theme;
    if (language !== undefined) updateData.language = language;

    const user = await haulingDB.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        notificationsEnabled: true,
        theme: true,
        language: true
      }
    });

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to update user preferences' });
  }
});

export default router;
