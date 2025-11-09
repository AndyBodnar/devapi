import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generateToken, blacklistToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  firstName: z.string().optional(),
  lastName: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, username, password, firstName, lastName } = registerSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    });

    if (existingUser) {
      res.status(400).json({ error: 'Email or username already exists' });
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
        lastName
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true
      }
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    res.status(201).json({
      message: 'User registered successfully',
      user,
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Create login metric
    await prisma.metric.create({
      data: {
        userId: user.id,
        type: 'login',
        metadata: {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      }
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await blacklistToken(token);
    }

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

export const me = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};
