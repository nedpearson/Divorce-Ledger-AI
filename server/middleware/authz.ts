import { Request, Response, NextFunction } from "express";

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
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function requireOwnership(resourceUserId: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    // Resource owner check logic depends on how resourceUserId is extracted
    // This is a template for specific middleware implementations
    next();
  };
}
