
import { Router } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { supabase } from "../config/supabase.js";

dotenv.config();

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET environment variable");
}

// ============================
// POST /auth/login
// เข้าสู่ระบบ
// ============================

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};

    // 1. ตรวจสอบข้อมูล Login
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.trim() === "" ||
      password === ""
    ) {
      return res.status(401).json({
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "AUTH_INVALID_CREDENTIALS"
        }
      });
    }

    // 2. ค้นหาผู้ใช้จาก Supabase
    const { data: user, error } = await supabase
      .from("users")
      .select("user_id, username, password, role, member_tier")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("GET USER ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }

    // 3. ตรวจสอบ Username และ Password
    if (!user || user.password !== password) {
      return res.status(401).json({
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "AUTH_INVALID_CREDENTIALS"
        }
      });
    }

    // 4. ตรวจสอบ Role
    const role = String(user.role ?? "").toLowerCase();

    if (role !== "customer" && role !== "admin") {
      return res.status(403).json({
        error: {
          code: "AUTH_FORBIDDEN",
          message: "AUTH_FORBIDDEN"
        }
      });
    }

    // 5. สร้าง Cart ให้ Customer เมื่อยังไม่มี Cart
    if (role === "customer") {
      const { data: existingCart, error: cartError } = await supabase
        .from("carts")
        .select("cart_id, user_id")
        .eq("user_id", user.user_id)
        .maybeSingle();

      if (cartError) {
        console.error("CHECK CART ERROR:", cartError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // สร้าง Cart เฉพาะเมื่อยังไม่มี
      if (!existingCart) {
        const { data: newCart, error: createCartError } = await supabase
          .from("carts")
          .insert({
            user_id: user.user_id,
            stage: "CART"
          })
          .select("cart_id, user_id")
          .single();

        if (createCartError || !newCart) {
          console.error("CREATE CART ERROR:", createCartError);

          return res.status(500).json({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Internal server error"
            }
          });
        }

        console.log("NEW CART CREATED:", newCart);
      }
    }

    // 6. สร้าง JWT
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

    // 7. ส่งข้อมูลกลับ
    if (role === "customer") {
      return res.status(200).json({
        token,
        role,
        memberTier: user.member_tier
      });
    }

    return res.status(200).json({
      token,
      role
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
