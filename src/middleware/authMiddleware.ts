
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

  // ตรวจสอบว่ามี Token หรือไม่
if (!authHeader) {
  return res.status(401).json({
    error: {
      code: "AUTH_REQUIRED",
      message: "AUTH_REQUIRED"
    }
  });
}

  // ตรวจสอบรูปแบบ Bearer Token
  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return res.status(401).json({
      message: "Invalid authorization format"
    });
  }

  const token = parts[1];

  try {
    // ตรวจสอบ JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    // เก็บข้อมูล User ไว้ใน Request
    req.user = decoded as {
      user_id: number;
      username: string;
      role: string;
    };

    return next();

  } catch {
    return res.status(401).json({
      message: "Invalid or expired token"
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

    // ต้องผ่าน Authentication ก่อน
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required"
      });
    }

    // ตรวจสอบ Role
    const userRole = req.user.role.toLowerCase();

   if (!allowedRoles.map(role => role.toLowerCase()).includes(userRole)) {
  return res.status(403).json({
    error: {
      code: "AUTH_FORBIDDEN",
      message: "You do not have permission to access this resource"
    }
  });
}
    return next();
  };
};
