import jwt from 'jsonwebtoken';
import { createClient } from 'redis';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Redis client for token blacklist
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  },
  password: process.env.REDIS_PASSWORD
});

redisClient.connect().catch(console.error);

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    return null;
  }
};

export const blacklistToken = async (token: string): Promise<void> => {
  const decoded = jwt.decode(token) as any;
  if (decoded && decoded.exp) {
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redisClient.setEx(`blacklist:${token}`, ttl, 'true');
    }
  }
};

export const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  const result = await redisClient.get(`blacklist:${token}`);
  return result !== null;
};

export { redisClient };
