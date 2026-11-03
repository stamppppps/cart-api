
import { Router } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { supabase } from "../config/supabase.js";

dotenv.config();

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "Username and password are required"
        }
      });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("user_id, username, password, role, member_tier")
      .eq("username", username)
      .single();

    if (error || !user) {
      return res.status(401).json({
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "Invalid username or password"
        }
      });
    }

    if (user.password !== password) {
      return res.status(401).json({
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "Invalid username or password"
        }
      });
    }

    const role = user.role.toLowerCase();

    if (role !== "customer" && role !== "admin") {
      return res.status(403).json({
        error: {
          code: "AUTH_INVALID_ROLE",
          message: "Invalid user role"
        }
      });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: role
      },
      JWT_SECRET,
      {
        expiresIn: "1h"
      }
    );

    if (role === "customer") {
      return res.status(200).json({
        token: token,
        role: role,
        memberTier: user.member_tier
      });
    }

    return res.status(200).json({
      token: token,
      role: role
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error"
      }
    });
  }
});

export default router;
