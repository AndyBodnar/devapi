import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, adminMiddleware } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';
import haulingDB from '../../config/haulingDB';
import bcrypt from 'bcryptjs';

const router = Router();
const prisma = new PrismaClient();

// GET /api/hauling/drivers - List all drivers
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get all users who are drivers (not admins)
    const drivers = await prisma.user.findMany({
      where: {
        role: 'USER',
        isActive: true
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get hauling profiles for each driver
    const driverIds = drivers.map(d => d.id);
    const profiles = await haulingDB.haulingProfile.findMany({
      where: {
        userId: { in: driverIds }
      }
    });

    // Get device status (online/offline)
    const deviceStatuses = await haulingDB.deviceStatus.findMany({
      where: {
        userId: { in: driverIds }
      }
    });

    // Combine data
    const driversWithDetails = drivers.map(driver => {
      const profile = profiles.find(p => p.userId === driver.id);
      const status = deviceStatuses.find(s => s.userId === driver.id);

      // Check if online (last seen within 10 minutes)
      const isOnline = status ?
        (new Date().getTime() - new Date(status.lastSeen).getTime()) < 10 * 60 * 1000
        : false;

      return {
        ...driver,
        profile: profile || null,
        deviceStatus: status ? {
          isOnline,
          lastSeen: status.lastSeen,
          appType: status.appType,
          appVersion: status.appVersion
        } : null
      };
    });

    res.json({ success: true, data: driversWithDetails });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch drivers' });
  }
});

// GET /api/hauling/drivers/:id - Get driver details
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const driver = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    if (!driver) {
      res.status(404).json({ success: false, error: 'Driver not found' });
      return;
    }

    // Get hauling profile
    const profile = await haulingDB.haulingProfile.findUnique({
      where: { userId: id }
    });

    // Get device status
    const deviceStatus = await haulingDB.deviceStatus.findUnique({
      where: { userId: id }
    });

    // Get job count and stats
    const jobStats = await haulingDB.job.aggregate({
      where: {
        OR: [
          { driverId: id },
          { assignedTo: id }
        ]
      },
      _count: true
    });

    const completedJobs = await haulingDB.job.count({
      where: {
        OR: [
          { driverId: id },
          { assignedTo: id }
        ],
        status: 'completed'
      }
    });

    // Get recent jobs
    const recentJobs = await haulingDB.job.findMany({
      where: {
        OR: [
          { driverId: id },
          { assignedTo: id }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const isOnline = deviceStatus ?
      (new Date().getTime() - new Date(deviceStatus.lastSeen).getTime()) < 10 * 60 * 1000
      : false;

    res.json({
      success: true,
      data: {
        ...driver,
        profile: profile || null,
        deviceStatus: deviceStatus ? {
          isOnline,
          lastSeen: deviceStatus.lastSeen,
          appType: deviceStatus.appType,
          appVersion: deviceStatus.appVersion,
          deviceInfo: deviceStatus.deviceInfo
        } : null,
        stats: {
          totalJobs: jobStats._count,
          completedJobs,
          activeJobs: jobStats._count - completedJobs
        },
        recentJobs
      }
    });
  } catch (error) {
    console.error('Error fetching driver details:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch driver details' });
  }
});

// POST /api/hauling/drivers - Create new driver
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      email,
      username,
      password,
      firstName,
      lastName,
      driverLicenseNumber,
      vehicleAssigned
    } = req.body;

    // Validate required fields
    if (!email || !username || !password) {
      res.status(400).json({ success: false, error: 'Email, username, and password are required' });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    });

    if (existingUser) {
      res.status(400).json({ success: false, error: 'Email or username already exists' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        firstName,
        lastName,
        role: 'USER'
      }
    });

    // Create hauling profile
    const profile = await haulingDB.haulingProfile.create({
      data: {
        userId: user.id,
        driverLicenseNumber,
        vehicleAssigned,
        notificationsEnabled: true
      }
    });

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        profile
      }
    });
  } catch (error) {
    console.error('Error creating driver:', error);
    res.status(500).json({ success: false, error: 'Failed to create driver' });
  }
});

// PUT /api/hauling/drivers/:id - Update driver
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      email,
      username,
      firstName,
      lastName,
      driverLicenseNumber,
      vehicleAssigned,
      notificationsEnabled
    } = req.body;

    // Update user in maindb
    const userUpdateData: any = {};
    if (email) userUpdateData.email = email;
    if (username) userUpdateData.username = username;
    if (firstName !== undefined) userUpdateData.firstName = firstName;
    if (lastName !== undefined) userUpdateData.lastName = lastName;

    const user = await prisma.user.update({
      where: { id },
      data: userUpdateData
    });

    // Update or create hauling profile
    const profileUpdateData: any = {};
    if (driverLicenseNumber !== undefined) profileUpdateData.driverLicenseNumber = driverLicenseNumber;
    if (vehicleAssigned !== undefined) profileUpdateData.vehicleAssigned = vehicleAssigned;
    if (notificationsEnabled !== undefined) profileUpdateData.notificationsEnabled = notificationsEnabled;
    profileUpdateData.updatedAt = new Date();

    const profile = await haulingDB.haulingProfile.upsert({
      where: { userId: id },
      update: profileUpdateData,
      create: {
        userId: id,
        ...profileUpdateData
      }
    });

    res.json({
      success: true,
      data: {
        ...user,
        profile
      }
    });
  } catch (error) {
    console.error('Error updating driver:', error);
    res.status(500).json({ success: false, error: 'Failed to update driver' });
  }
});

// DELETE /api/hauling/drivers/:id - Deactivate driver
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Deactivate user (soft delete)
    await prisma.user.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({ success: true, message: 'Driver deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating driver:', error);
    res.status(500).json({ success: false, error: 'Failed to deactivate driver' });
  }
});

// GET /api/hauling/drivers/stats/online - Get online drivers
router.get('/stats/online', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get all device statuses
    const deviceStatuses = await haulingDB.deviceStatus.findMany();

    // Filter online (last seen within 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const onlineDrivers = deviceStatuses.filter(status =>
      new Date(status.lastSeen) > tenMinutesAgo
    );

    // Get user details for online drivers
    const onlineDriverIds = onlineDrivers.map(d => d.userId);
    const drivers = await prisma.user.findMany({
      where: {
        id: { in: onlineDriverIds },
        isActive: true
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true
      }
    });

    const driversWithStatus = drivers.map(driver => {
      const status = onlineDrivers.find(s => s.userId === driver.id);
      return {
        ...driver,
        lastSeen: status?.lastSeen,
        appType: status?.appType,
        appVersion: status?.appVersion
      };
    });

    res.json({ success: true, data: driversWithStatus });
  } catch (error) {
    console.error('Error fetching online drivers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch online drivers' });
  }
});

export default router;
