
import { Router } from "express";
import { supabase } from "../config/supabase.js";
import {
  authenticateToken,
  authorizeRole
} from "../middleware/authMiddleware.js";

const router = Router();

// ==================================
// GET /products
// แสดงรายการสินค้า
// ==================================

router.get(
  "/",
  authenticateToken,
  async (req, res) => {
    try {
      const user = (req as any).user;

      let query = supabase
        .from("products")
        .select("product_id, name, price, weight, stock, status")
        .order("product_id", { ascending: true });

      if (user.role === "customer") {
        query = query
          .eq("status", "ON_SALE")
          .gt("stock", 0);
      }

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
        products: products
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
// ==================================

router.patch(
  "/:productId",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { productId } = req.params;
      const { name, price, weight, stock } = req.body;

      // ตรวจสอบว่ามีข้อมูลส่งมาหรือไม่
      if (
        name === undefined &&
        price === undefined &&
        weight === undefined &&
        stock === undefined
      ) {
        return res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message: "No product fields provided"
          }
        });
      }

      // ตรวจสอบชื่อสินค้า
      if (
        name !== undefined &&
        (typeof name !== "string" || name.trim() === "")
      ) {
        return res.status(400).json({
          error: {
            code: "INVALID_NAME",
            message: "Product name must not be empty"
          }
        });
      }

      // ตรวจสอบราคา
      if (
        price !== undefined &&
        (!Number.isInteger(price) || price < 0)
      ) {
        return res.status(400).json({
          error: {
            code: "INVALID_PRICE",
            message: "Price must be a non-negative integer"
          }
        });
      }

      // ตรวจสอบน้ำหนัก
      if (
        weight !== undefined &&
        (!Number.isInteger(weight) || weight < 0)
      ) {
        return res.status(400).json({
          error: {
            code: "INVALID_WEIGHT",
            message: "Weight must be a non-negative integer"
          }
        });
      }

      // ตรวจสอบจำนวนสินค้า
      if (
        stock !== undefined &&
        (!Number.isInteger(stock) || stock < 0)
      ) {
        return res.status(400).json({
          error: {
            code: "INVALID_STOCK",
            message: "Stock must be a non-negative integer"
          }
        });
      }

      // เตรียมข้อมูลสำหรับ Update
      const updateData: {
        name?: string;
        price?: number;
        weight?: number;
        stock?: number;
      } = {};

      if (name !== undefined) {
        updateData.name = name.trim();
      }

      if (price !== undefined) {
        updateData.price = price;
      }

      if (weight !== undefined) {
        updateData.weight = weight;
      }

      if (stock !== undefined) {
        updateData.stock = stock;
      }

      // Update ข้อมูลสินค้าใน Supabase
      const { data: product, error } = await supabase
        .from("products")
        .update(updateData)
        .eq("product_id", productId)
        .select("product_id, name, price, weight, stock, status")
        .maybeSingle();

      if (error) {
        console.error("UPDATE PRODUCT ERROR:", error);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // ตรวจสอบว่าสินค้ามีอยู่จริงหรือไม่
      if (!product) {
        return res.status(404).json({
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found"
          }
        });
      }

      return res.status(200).json({
        message: "Product updated successfully",
        product: product
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
      const { status } = req.body;

      // ตรวจสอบสถานะที่อนุญาต
      if (!["ON_SALE", "OFF_SALE"].includes(status)) {
        return res.status(400).json({
          error: {
            code: "INVALID_PRODUCT_STATUS",
            message: "Status must be ON_SALE or OFF_SALE"
          }
        });
      }

      // Update สถานะสินค้า
      const { data: product, error } = await supabase
        .from("products")
        .update({ status })
        .eq("product_id", productId)
        .select("product_id, name, price, weight, stock, status")
        .maybeSingle();

      if (error) {
        console.error("SET PRODUCT STATUS ERROR:", error);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // ตรวจสอบว่าสินค้ามีอยู่จริงหรือไม่
      if (!product) {
        return res.status(404).json({
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found"
          }
        });
      }

      return res.status(200).json({
        message: "Product status updated successfully",
        product: product
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
