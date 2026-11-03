
import { Router } from "express";
import type { Response } from "express";

import { supabase } from "../config/supabase.js";
import {
  formatOrderId,
  parseOrderId
} from "../utils/orderId.js";

import {
  authenticateToken,
  authorizeRole,
  type AuthRequest
} from "../middleware/authMiddleware.js";

const router = Router();



// =====================================
// GET /orders
// ดูรายการคำสั่งซื้อของผู้ใช้ที่ Login
// =====================================

router.get(
  "/",
  authenticateToken,
  authorizeRole("customer"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.user_id;

      const { data, error } = await supabase
        .from("orders")
        .select(`
          order_id,
          status,
          subtotal,
          discount,
          shipping_fee,
          total,
          zone,
          speed,
          coupon_code,
          created_at,
          order_items (
            order_item_id,
            product_id,
            product_name,
            unit_price,
            quantity
          )
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("GET ORDERS ERROR:", error);

        return res.status(500).json({
          error: {
            code: "DATABASE_ERROR",
            message: "Unable to retrieve orders"
          }
        });
      }

      return res.status(200).json({
        orders: (data ?? []).map((order) => ({
          ...order,
          order_id: formatOrderId(order.order_id)
        }))
      });

    } catch (error) {
      console.error("GET ORDERS ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);

// =====================================
// GET /orders/:id
// ดูรายละเอียดคำสั่งซื้อ
// =====================================

router.get(
  "/:id",
  authenticateToken,
  authorizeRole("customer"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.user_id;
      const orderId = parseOrderId(req.params.id);

      if (orderId === null) {
        return res.status(400).json({
          error: {
            code: "INVALID_ORDER_ID",
            message: "Invalid order ID"
          }
        });
      }

      const { data, error } = await supabase
        .from("orders")
        .select(`
          order_id,
          status,
          subtotal,
          discount,
          shipping_fee,
          total,
          zone,
          speed,
          coupon_code,
          created_at,
          order_items (
            order_item_id,
            product_id,
            product_name,
            unit_price,
            quantity
          )
        `)
        .eq("order_id", orderId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("GET ORDER DETAIL ERROR:", error);

        return res.status(500).json({
          error: {
            code: "DATABASE_ERROR",
            message: "Unable to retrieve order"
          }
        });
      }

      if (!data) {
        return res.status(404).json({
          error: {
            code: "ORDER_NOT_FOUND",
            message: "Order not found"
          }
        });
      }

      return res.status(200).json({
        order: {
          ...data,
          order_id: formatOrderId(data.order_id)
        }
      });

    } catch (error) {
      console.error("GET ORDER DETAIL ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);

// =====================================
// POST /orders/:id/cancel
// ยกเลิกคำสั่งซื้อที่รอชำระเงิน
// =====================================

router.post(
  "/:id/cancel",
  authenticateToken,
  authorizeRole("customer"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.user_id;
      const orderId = parseOrderId(req.params.id);

      // 1. ตรวจสอบ Order ID
      if (orderId === null) {
        return res.status(400).json({
          error: {
            code: "INVALID_ORDER_ID",
            message: "Invalid order ID"
          }
        });
      }

      // 2. เรียก PostgreSQL Function
      const { error } = await supabase.rpc("cancel_checkout", {
        p_user_id: userId,
        p_order_id: orderId
      });

      if (error) {
        console.error("CANCEL ORDER RPC ERROR:", error);

        // Order ไม่พบ หรือไม่ใช่ของผู้ใช้
        if (error.message.includes("ORDER_NOT_FOUND")) {
          return res.status(404).json({
            error: {
              code: "ORDER_NOT_FOUND",
              message: "Order not found"
            }
          });
        }

        // Order ไม่อยู่ในสถานะที่ยกเลิกได้
        if (error.message.includes("ORDER_CANNOT_BE_CANCELLED")) {
          return res.status(409).json({
            error: {
              code: "ORDER_CANNOT_BE_CANCELLED",
              message: "Order cannot be cancelled"
            }
          });
        }

        if (error.message.includes("CART_NOT_FOUND")) {
          return res.status(409).json({
            error: {
              code: "CART_NOT_FOUND",
              message: "Cart associated with this order was not found"
            }
          });
        }

        if (error.message.includes("CART_NOT_IN_CHECKOUT")) {
          return res.status(409).json({
            error: {
              code: "CART_NOT_IN_CHECKOUT",
              message: "Cart is not in checkout stage"
            }
          });
        }

        return res.status(500).json({
          error: {
            code: "CANCEL_ORDER_FAILED",
            message: "Unable to cancel order"
          }
        });
      }

      // 3. อ่านข้อมูล Order หลังยกเลิก
      const { data: order, error: fetchError } = await supabase
        .from("orders")
        .select("order_id, status, cart_id")
        .eq("order_id", orderId)
        .eq("user_id", userId)
        .single();

      if (fetchError || !order) {
        console.error("FETCH CANCELLED ORDER ERROR:", fetchError);

        return res.status(500).json({
          error: {
            code: "ORDER_FETCH_FAILED",
            message: "Order was cancelled but unable to retrieve its details"
          }
        });
      }

      return res.status(200).json({
        message: "Order cancelled successfully",
        order: {
          orderId: formatOrderId(order.order_id),
          status: order.status,
          cartId: order.cart_id
        }
      });

    } catch (error) {
      console.error("CANCEL ORDER ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);

// =====================================
// POST /orders/:id/pay-success
// จำลองการชำระเงินสำเร็จ
// =====================================

router.post(
  "/:id/pay-success",
  authenticateToken,
  authorizeRole("customer"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.user_id;
      const orderId = parseOrderId(req.params.id);

      // 1. ตรวจสอบ Order ID
      if (orderId === null) {
        return res.status(400).json({
          error: {
            code: "INVALID_ORDER_ID",
            message: "Invalid order ID"
          }
        });
      }

      // 2. เรียก PostgreSQL Function
      const { data, error } = await supabase.rpc("pay_success", {
        p_user_id: userId,
        p_order_id: orderId
      });

      if (error) {
        console.error("PAY SUCCESS RPC ERROR:", error);

        if (error.message.includes("ORDER_NOT_FOUND")) {
          return res.status(404).json({
            error: {
              code: "ORDER_NOT_FOUND",
              message: "Order not found"
            }
          });
        }

        if (error.message.includes("ORDER_CANNOT_BE_PAID")) {
          return res.status(409).json({
            error: {
              code: "ORDER_CANNOT_BE_PAID",
              message: "Order cannot be paid"
            }
          });
        }

        if (error.message.includes("CART_NOT_FOUND")) {
          return res.status(409).json({
            error: {
              code: "CART_NOT_FOUND",
              message: "Cart not found"
            }
          });
        }

        if (error.message.includes("CART_NOT_IN_CHECKOUT")) {
          return res.status(409).json({
            error: {
              code: "CART_NOT_IN_CHECKOUT",
              message: "Cart is not in checkout stage"
            }
          });
        }

        return res.status(500).json({
          error: {
            code: "PAYMENT_SUCCESS_FAILED",
            message: "Unable to complete payment"
          }
        });
      }

      // 3. ส่งผลลัพธ์กลับ
      // สมมติว่า pay_success คืนค่า order_id เป็นตัวเลข
      return res.status(200).json({
        message: "Payment successful",
        order: {
          orderId: formatOrderId(data),
          status: "PAID"
        },
        cart: {
          stage: "SUCCESS",
          items: [],
          couponCode: null
        }
      });

    } catch (error) {
      console.error("PAY SUCCESS ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);

// =====================================
// POST /orders/:id/pay-fail
// จำลองการชำระเงินไม่สำเร็จ
// =====================================

router.post(
  "/:id/pay-fail",
  authenticateToken,
  authorizeRole("customer"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.user_id;
      const orderId = parseOrderId(req.params.id);

      // 1. ตรวจสอบ Order ID
      if (orderId === null) {
        return res.status(400).json({
          error: {
            code: "INVALID_ORDER_ID",
            message: "Invalid order ID"
          }
        });
      }

      // 2. ค้นหา Order ของ Customer ที่ Login
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("order_id, user_id, status, cart_id")
        .eq("order_id", orderId)
        .eq("user_id", userId)
        .maybeSingle();

      if (orderError) {
        console.error("GET ORDER ERROR:", orderError);

        return res.status(500).json({
          error: {
            code: "DATABASE_ERROR",
            message: "Unable to retrieve order"
          }
        });
      }

      if (!order) {
        return res.status(404).json({
          error: {
            code: "ORDER_NOT_FOUND",
            message: "Order not found"
          }
        });
      }

      // 3. ตรวจสอบสถานะ Order
      if (order.status !== "PENDING_PAYMENT") {
        return res.status(409).json({
          error: {
            code: "ORDER_NOT_PENDING_PAYMENT",
            message: "Order is not pending payment"
          }
        });
      }

      // 4. ตรวจสอบ Cart ที่สัมพันธ์กับ Order
      const { data: cart, error: cartError } = await supabase
        .from("carts")
        .select("cart_id, stage")
        .eq("cart_id", order.cart_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (cartError) {
        console.error("GET CART ERROR:", cartError);

        return res.status(500).json({
          error: {
            code: "DATABASE_ERROR",
            message: "Unable to retrieve cart"
          }
        });
      }

      if (!cart || cart.stage !== "CHECKOUT") {
        return res.status(409).json({
          error: {
            code: "CART_NOT_IN_CHECKOUT",
            message: "Cart is not in checkout stage"
          }
        });
      }

      // 5. แจ้งผลการชำระเงินไม่สำเร็จ
      // ไม่แก้ไข Order, Cart, Cart Items และ Stock

      return res.status(200).json({
        message: "Payment failed. Please try again.",
        order: {
          orderId: formatOrderId(order.order_id),
          status: order.status
        },
        cart: {
          cartId: cart.cart_id,
          stage: cart.stage
        }
      });

    } catch (error) {
      console.error("PAYMENT FAILED ERROR:", error);

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
