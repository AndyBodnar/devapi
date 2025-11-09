import { Router } from 'express';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} from '../controllers/userController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// All routes require authentication and admin role
router.use(authMiddleware, adminMiddleware);

router.get('/', getAllUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
