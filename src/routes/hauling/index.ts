import { Router } from 'express';
import jobRoutes from './jobRoutes';
import driverRoutes from './driverRoutes';
import heartbeatRoutes from './heartbeatRoutes';
import locationRoutes from './locationRoutes';
import notificationRoutes from './notificationRoutes';
import analyticsRoutes from './analyticsRoutes';
import errorRoutes from './errorRoutes';
import issueRoutes from './issueRoutes';
import documentRoutes from './documentRoutes';
import dvirRoutes from './dvirRoutes';
import databaseRoutes from './databaseRoutes';
import settingsRoutes from './settingsRoutes';
import auditRoutes from './auditRoutes';
// import messagingRoutes from './messagingRoutes';

const router = Router();

// Mount all hauling routes
router.use('/jobs', jobRoutes);
router.use('/drivers', driverRoutes);
router.use('/heartbeat', heartbeatRoutes);
router.use('/location', locationRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/errors', errorRoutes);
router.use('/issues', issueRoutes);
router.use('/documents', documentRoutes);
router.use('/dvir', dvirRoutes);
router.use('/database', databaseRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit', auditRoutes);
// router.use('/messages', messagingRoutes);

export default router;
