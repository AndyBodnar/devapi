import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';

const router = Router();

// POST /api/hauling/dvir - Submit DVIR
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const {
      vehicleId,
      inspectionType,
      odometer,
      checklistItems,
      defectsFound,
      defectDescription,
      safeToOperate,
      driverSignature,
      photos
    } = req.body;

    // Create DVIR report
    const dvir = await haulingDB.dvirReport.create({
      data: {
        driverId: BigInt(userId),
        vehicleId: vehicleId ? BigInt(vehicleId) : null,
        inspectionType: inspectionType || 'PRE_TRIP',
        odometer: odometer ? parseInt(odometer) : null,
        checklistItems: JSON.stringify(checklistItems || {}),
        defectsFound: defectsFound || false,
        defectDescription: defectDescription || null,
        safeToOperate: safeToOperate !== false,
        driverSignature: driverSignature || null,
        photos: JSON.stringify(photos || []),
        status: 'PENDING',
        createdAt: new Date()
      }
    });

    res.json({
      success: true,
      data: {
        id: dvir.id.toString(),
        driverId: dvir.driverId.toString(),
        vehicleId: dvir.vehicleId?.toString(),
        inspectionType: dvir.inspectionType,
        defectsFound: dvir.defectsFound,
        safeToOperate: dvir.safeToOperate,
        status: dvir.status,
        createdAt: dvir.createdAt
      }
    });
  } catch (error) {
    console.error('Error submitting DVIR:', error);
    res.status(500).json({ success: false, error: 'Failed to submit DVIR' });
  }
});

// GET /api/hauling/dvir/:driverId - Get driver DVIRs
router.get('/:driverId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { driverId } = req.params;
    const { startDate, endDate, limit } = req.query;

    const where: any = { driverId: BigInt(driverId) };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const dvirs = await haulingDB.dvirReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit as string) : undefined
    });

    res.json({
      success: true,
      data: dvirs.map(d => ({
        id: d.id.toString(),
        driverId: d.driverId.toString(),
        vehicleId: d.vehicleId?.toString(),
        inspectionType: d.inspectionType,
        odometer: d.odometer,
        checklistItems: typeof d.checklistItems === 'string' ? JSON.parse(d.checklistItems) : d.checklistItems,
        defectsFound: d.defectsFound,
        defectDescription: d.defectDescription,
        safeToOperate: d.safeToOperate,
        status: d.status,
        driverSignature: d.driverSignature,
        mechanicNotes: d.mechanicNotes,
        mechanicSignedAt: d.mechanicSignedAt,
        createdAt: d.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching DVIRs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch DVIRs' });
  }
});

// GET /api/hauling/dvir/report/:id - Get specific DVIR
router.get('/report/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const dvir = await haulingDB.dvirReport.findUnique({
      where: { id: BigInt(id) }
    });

    if (!dvir) {
      res.status(404).json({ success: false, error: 'DVIR not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: dvir.id.toString(),
        driverId: dvir.driverId.toString(),
        vehicleId: dvir.vehicleId?.toString(),
        inspectionType: dvir.inspectionType,
        odometer: dvir.odometer,
        checklistItems: typeof dvir.checklistItems === 'string' ? JSON.parse(dvir.checklistItems) : dvir.checklistItems,
        defectsFound: dvir.defectsFound,
        defectDescription: dvir.defectDescription,
        safeToOperate: dvir.safeToOperate,
        status: dvir.status,
        driverSignature: dvir.driverSignature,
        photos: typeof dvir.photos === 'string' ? JSON.parse(dvir.photos) : dvir.photos,
        mechanicNotes: dvir.mechanicNotes,
        mechanicSignedAt: dvir.mechanicSignedAt,
        createdAt: dvir.createdAt,
        updatedAt: dvir.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching DVIR:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch DVIR' });
  }
});

// PUT /api/hauling/dvir/:id - Update DVIR (mechanic sign-off)
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;
    const { mechanicNotes, status } = req.body;

    if (userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const updateData: any = { updatedAt: new Date() };
    if (mechanicNotes !== undefined) updateData.mechanicNotes = mechanicNotes;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'APPROVED' || status === 'COMPLETED') {
        updateData.mechanicSignedAt = new Date();
      }
    }

    const dvir = await haulingDB.dvirReport.update({
      where: { id: BigInt(id) },
      data: updateData
    });

    res.json({
      success: true,
      data: {
        id: dvir.id.toString(),
        status: dvir.status,
        mechanicNotes: dvir.mechanicNotes,
        mechanicSignedAt: dvir.mechanicSignedAt,
        updatedAt: dvir.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating DVIR:', error);
    res.status(500).json({ success: false, error: 'Failed to update DVIR' });
  }
});

// GET /api/hauling/dvir/pending/all - Get all pending DVIRs (admin only)
router.get('/pending/all', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const dvirs = await haulingDB.dvirReport.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          { defectsFound: true, status: { not: 'COMPLETED' } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: dvirs.map(d => ({
        id: d.id.toString(),
        driverId: d.driverId.toString(),
        vehicleId: d.vehicleId?.toString(),
        inspectionType: d.inspectionType,
        defectsFound: d.defectsFound,
        defectDescription: d.defectDescription,
        safeToOperate: d.safeToOperate,
        status: d.status,
        createdAt: d.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching pending DVIRs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending DVIRs' });
  }
});

export default router;
