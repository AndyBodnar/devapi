import { Request, Response, NextFunction } from 'express';
import { verifyToken, isTokenBlacklisted, TokenPayload } from '../utils/jwt';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);

    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Attach user to request
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

export const adminMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
};
