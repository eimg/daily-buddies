import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma, UserRole } from "../prisma";

interface TokenPayload {
  userId: string;
  role: UserRole;
  familyId?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
    familyId?: string | null;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const [, token] = authHeader.split(" ");
  if (!token) {
    return res.status(401).json({ error: "Malformed authorization header" });
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        role: true,
        familyId: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    req.user = {
      id: user.id,
      role: user.role,
      familyId: user.familyId,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(roles: UserRole | UserRole[]) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "Action not permitted" });
    }

    next();
  };
}
