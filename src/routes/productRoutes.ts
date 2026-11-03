
import { Router } from "express";
import { supabase } from "../config/supabase.js";
import {
  authenticateToken,
  authorizeRole,
  type AuthRequest
} from "../middleware/authMiddleware.js";

const router = Router();

// ==================================
// PRODUCT UPDATE VALIDATION
// Pure Function
// ตรวจสอบข้อมูลที่อนุญาตให้ Admin แก้ไข
// ==================================

const validateProductUpdate = (body: any) => {
  const invalidFields: string[] = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      valid: false,
      invalidFields: ["body"]
    };
  }

  const allowedFields = ["price", "stock"];

  // ตรวจสอบว่ามีการส่งข้อมูลมาอย่างน้อยหนึ่งฟิลด์
  const fields = Object.keys(body);

  if (fields.length === 0) {
    invalidFields.push("body");
  }

  // ตรวจสอบฟิลด์ที่ไม่อนุญาต
  for (const field of fields) {
    if (!allowedFields.includes(field)) {
      invalidFields.push(field);
    }
  }

  // ตรวจสอบราคา: จำนวนเต็ม 1 - 50,000
  if (
    body.price !== undefined &&
    (
      !Number.isInteger(body.price) ||
      body.price < 1 ||
      body.price > 50000
    )
  ) {
    invalidFields.push("price");
  }

  // ตรวจสอบจำนวนสินค้า: จำนวนเต็ม 0 - 9,999
  if (
    body.stock !== undefined &&
    (
      !Number.isInteger(body.stock) ||
      body.stock < 0 ||
      body.stock > 9999
    )
  ) {
    invalidFields.push("stock");
  }

  return {
    valid: invalidFields.length === 0,
    invalidFields: [...new Set(invalidFields)]
  };
};

// ==================================
// GET /products
// แสดงรายการสินค้า
// ==================================

router.get(
  "/",
  authenticateToken,
  async (req, res) => {
    try {
      const user = (req as AuthRequest).user;

      if (!user) {
        return res.status(401).json({
          error: {
            code: "AUTH_REQUIRED",
            message: "AUTH_REQUIRED"
          }
        });
      }

      let query = supabase
        .from("products")
        .select("product_id, name, price, weight, stock, status")
        .order("product_id", { ascending: true });

      // Customer เห็นเฉพาะสินค้าที่เปิดขายและมี Stock
      if (user.role === "customer") {
        query = query
          .eq("status", "ON_SALE")
          .gt("stock", 0);
      }

      // Admin เห็นสินค้าทั้งหมด
      const { data: products, error } = await query;

      if (error) {
        console.error("GET PRODUCTS ERROR:", error);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      return res.status(200).json({
        products: products ?? []
      });

    } catch (error) {
      console.error("GET PRODUCTS ERROR:", error);

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
// OP-15 UPDATE PRODUCT
// PATCH /products/:productId
// Admin only
// แก้ไขเฉพาะ Price และ Stock
// ==================================

router.patch(
  "/:productId",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { productId } = req.params;

      // 1. ตรวจสอบว่าสินค้ามีอยู่จริงก่อน
      const { data: existingProduct, error: findError } =
        await supabase
          .from("products")
          .select("product_id")
          .eq("product_id", productId)
          .maybeSingle();

      if (findError) {
        console.error("FIND PRODUCT ERROR:", findError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      if (!existingProduct) {
        return res.status(404).json({
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "PRODUCT_NOT_FOUND"
          }
        });
      }

      // 2. ตรวจสอบข้อมูลที่ส่งมา
      const validation = validateProductUpdate(req.body);

      if (!validation.valid) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "VALIDATION_ERROR",
            invalidFields: validation.invalidFields
          }
        });
      }

      // 3. เตรียมข้อมูลสำหรับ Update
      const updateData: {
        price?: number;
        stock?: number;
      } = {};

      if (req.body.price !== undefined) {
        updateData.price = req.body.price;
      }

      if (req.body.stock !== undefined) {
        updateData.stock = req.body.stock;
      }

      // 4. Update ข้อมูลสินค้าใน Supabase
      const { data: product, error: updateError } = await supabase
        .from("products")
        .update(updateData)
        .eq("product_id", productId)
        .select("product_id, name, price, weight, stock, status")
        .single();

      if (updateError) {
        console.error("UPDATE PRODUCT ERROR:", updateError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      return res.status(200).json({
        message: "Product updated successfully",
        product
      });

    } catch (error) {
      console.error("UPDATE PRODUCT ERROR:", error);

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
// OP-16 SET PRODUCT STATUS
// PATCH /products/:productId/status
// Admin only
// ==================================

router.patch(
  "/:productId/status",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { productId } = req.params;
      const { status } = req.body ?? {};

      // 1. ตรวจสอบว่าสินค้ามีอยู่จริง
      const { data: existingProduct, error: findError } =
        await supabase
          .from("products")
          .select("product_id")
          .eq("product_id", productId)
          .maybeSingle();

      if (findError) {
        console.error("FIND PRODUCT ERROR:", findError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      if (!existingProduct) {
        return res.status(404).json({
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "PRODUCT_NOT_FOUND"
          }
        });
      }

      // 2. ตรวจสอบสถานะที่อนุญาต
      if (
        typeof status !== "string" ||
        !["ON_SALE", "OFF_SALE"].includes(status)
      ) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "VALIDATION_ERROR",
            invalidFields: ["status"]
          }
        });
      }

      // 3. Update สถานะสินค้า
      // หากเป็นสถานะเดิม Supabase ก็ Update ค่าเดิมและตอบกลับสำเร็จ
      const { data: product, error: updateError } = await supabase
        .from("products")
        .update({ status })
        .eq("product_id", productId)
        .select("product_id, name, price, weight, stock, status")
        .single();

      if (updateError) {
        console.error("SET PRODUCT STATUS ERROR:", updateError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      return res.status(200).json({
        message: "Product status updated successfully",
        product
      });

    } catch (error) {
      console.error("SET PRODUCT STATUS ERROR:", error);

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
