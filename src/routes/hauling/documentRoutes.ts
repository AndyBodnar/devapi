import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import haulingDB from '../../config/haulingDB';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    const allowedTypes = /jpeg|jpg|png|pdf|heic/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, PNG, HEIC) and PDFs are allowed'));
    }
  }
});

// POST /api/hauling/documents/upload - Upload document
router.post('/upload', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    const { jobId, attachmentType } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Create attachment record
    const attachmentData: any = {
      uploadedBy: userId,
      fileName: req.file.originalname,
      fileUrl: `/uploads/${req.file.filename}`,
      fileType: req.file.mimetype,
      attachmentType: attachmentType || 'other'
    };

    if (jobId) {
      attachmentData.jobId = BigInt(jobId);
    }

    const attachment = await haulingDB.jobAttachment.create({
      data: attachmentData
    });

    res.json({
      success: true,
      data: {
        id: attachment.id.toString(),
        fileName: attachment.fileName,
        fileUrl: attachment.fileUrl,
        fileType: attachment.fileType,
        attachmentType: attachment.attachmentType,
        createdAt: attachment.createdAt
      }
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    // Clean up file if database insert failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: 'Failed to upload document' });
  }
});

// GET /api/hauling/documents/:id - Download/view document
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const attachment = await haulingDB.jobAttachment.findUnique({
      where: { id: BigInt(id) }
    });

    if (!attachment) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const filePath = path.join(__dirname, '../../..', attachment.fileUrl);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, error: 'File not found on server' });
      return;
    }

    // Set appropriate content type
    res.setHeader('Content-Type', attachment.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${attachment.fileName}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ success: false, error: 'Failed to download document' });
  }
});

// GET /api/hauling/documents/job/:jobId - Get all documents for a job
router.get('/job/:jobId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;

    const attachments = await haulingDB.jobAttachment.findMany({
      where: { jobId: BigInt(jobId) },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: attachments.map(att => ({
        id: att.id.toString(),
        fileName: att.fileName,
        fileUrl: att.fileUrl,
        fileType: att.fileType,
        attachmentType: att.attachmentType,
        uploadedBy: att.uploadedBy,
        createdAt: att.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching job documents:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch documents' });
  }
});

// DELETE /api/hauling/documents/:id - Delete document
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;

    if (userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const attachment = await haulingDB.jobAttachment.findUnique({
      where: { id: BigInt(id) }
    });

    if (!attachment) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    // Delete file from filesystem
    const filePath = path.join(__dirname, '../../..', attachment.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await haulingDB.jobAttachment.delete({
      where: { id: BigInt(id) }
    });

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
});

export default router;
