
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
          code: "AUTH_REQUIRED",
          message: "AUTH_REQUIRED"
        }
      });
    }

    // 1. ค้นหาผู้ใช้
    const { data: user, error } = await supabase
      .from("users")
      .select("user_id, username, password, role, member_tier")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("GET USER ERROR:", error);

      return res.status(500).json({
        error: {
          code: "AUTH_REQUIRED",
          message: "AUTH_REQUIRED"
        }
      });
    }

    if (!user || user.password !== password) {
      return res.status(401).json({
        error: {
          code: "AUTH_REQUIRED",
          message: "AUTH_REQUIRED"
        }
      });
    }

    // 2. ตรวจสอบ Role
    const role = user.role.toLowerCase();

    if (role !== "customer" && role !== "admin") {
      return res.status(403).json({
        error: {
          code: "AUTH_REQUIRED",
          message: "AUTH_REQUIRED"
        }
      });
    }

    // 3. สร้าง Cart อัตโนมัติสำหรับ Customer
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
            code: "AUTH_REQUIRED",
            message: "AUTH_REQUIRED"
          }
        });
      }

      // ถ้ายังไม่มี Cart ให้สร้างใหม่
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
              code: "AUTH_REQUIRED",
              message: "AUTH_REQUIRED"
            }
          });
        }

        console.log("NEW CART CREATED:", newCart);
      } else {
        console.log("EXISTING CART FOUND:", existingCart);
      }
    }

    // 4. สร้าง JWT
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

    // 5. ส่งข้อมูลกลับ
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
        code: "AUTH_REQUIRED",
        message: "AUTH_REQUIRED"
      }
    });
  }
});

export default router;
