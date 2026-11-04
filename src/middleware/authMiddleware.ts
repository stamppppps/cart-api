import "../config/env.js";

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET environment variable");
}

export interface AuthRequest extends Request {
  user?: {
    user_id: number;
    username: string;
    role: string;
  };
}

// ============================
// AUTHENTICATE TOKEN
// ตรวจสอบ JWT
// ============================

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: {
        code: "AUTH_REQUIRED",
        message: "AUTH_REQUIRED"
      }
    });
  }

  const parts = authHeader.trim().split(/\s+/);

  if (
    parts.length !== 2 ||
    parts[0] !== "Bearer" ||
    !parts[1]
  ) {
    return res.status(401).json({
      error: {
        code: "AUTH_REQUIRED",
        message: "AUTH_REQUIRED"
      }
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (
      typeof decoded === "string" ||
      typeof decoded.user_id !== "number" ||
      typeof decoded.username !== "string" ||
      typeof decoded.role !== "string"
    ) {
      return res.status(401).json({
        error: {
          code: "AUTH_REQUIRED",
          message: "AUTH_REQUIRED"
        }
      });
    }

    req.user = {
      user_id: decoded.user_id,
      username: decoded.username,
      role: decoded.role.toLowerCase()
    };

    return next();

  } catch (error) {
    return res.status(401).json({
      error: {
        code: "AUTH_REQUIRED",
        message: "AUTH_REQUIRED"
      }
    });
  }
};

// ============================
// AUTHORIZE ROLE
// ตรวจสอบสิทธิ์ของ User
// ============================

export const authorizeRole = (...allowedRoles: string[]) => {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {

    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "AUTH_REQUIRED",
          message: "AUTH_REQUIRED"
        }
      });
    }

    const userRole = req.user.role.toLowerCase();

    const permittedRoles = allowedRoles.map((role) =>
      role.toLowerCase()
    );

    if (!permittedRoles.includes(userRole)) {
      return res.status(403).json({
        error: {
          code: "AUTH_FORBIDDEN",
          message: "AUTH_FORBIDDEN"
        }
      });
    }

    return next();
  };
};