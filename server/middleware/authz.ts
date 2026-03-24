import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface User {
      id: string;
      isAdmin: boolean;
      environment: string;
    }
    interface Request {
      isAuthenticated(): boolean;
      user?: User;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Attach user to req to ensure downstream works
  if (!req.user) {
     req.user = { id: userId, isAdmin: false, environment: req.headers['x-environment'] as string || 'demo' };
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requireOwnership(resourceUserId: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // Resource owner check logic depends on how resourceUserId is extracted
    // This is a template for specific middleware implementations
    next();
  };
}
