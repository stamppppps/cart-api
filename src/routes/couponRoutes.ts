
import { Router } from "express";
import { supabase } from "../config/supabase.js";
import {
  authenticateToken,
  authorizeRole
} from "../middleware/authMiddleware.js";

const router = Router();

// ==================================
// OP-17 SET COUPON STATUS
// PATCH /coupons/:code/status
// Admin only
// ==================================

router.patch(
  "/:code/status",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { code } = req.params;
      const { status } = req.body;

      // ตรวจสอบสถานะที่อนุญาต
      if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Status must be ACTIVE or INACTIVE"
        }
      });
}

      // อัปเดตสถานะคูปอง
      const { data: coupon, error } = await supabase
        .from("coupons")
        .update({ status })
        .eq("code", code)
        .select("code, percent, min_spend, status")
        .maybeSingle();

      if (error) {
        console.error("SET COUPON STATUS ERROR:", error);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // ตรวจสอบว่าพบคูปองหรือไม่
      if (!coupon) {
        return res.status(404).json({
          error: {
            code: "COUPON_NOT_FOUND",
            message: "Coupon not found"
          }
        });
      }

      return res.status(200).json({
        message: "Coupon status updated successfully",
        coupon
      });

    } catch (error) {
      console.error("SET COUPON STATUS ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);


// ==================================
// OP-18 LIST COUPONS
// GET /coupons
// Admin only
// ==================================

router.get(
  "/",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { data: coupons, error } = await supabase
        .from("coupons")
        .select("code, percent, min_spend, status")
        .order("code", { ascending: true });

      if (error) {
        console.error("LIST COUPONS ERROR:", error);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      return res.status(200).json({
        message: "Coupons retrieved successfully",
        coupons
      });

    } catch (error) {
      console.error("LIST COUPONS ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);


export default router;
