
import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { formatOrderId } from "../utils/orderId.js";

import {
  authenticateToken,
  authorizeRole
} from "../middleware/authMiddleware.js";

import {
  isProductAvailable,
  validateQuantityChange,
  calculateSubtotal,
  calculateTotalWeight,
  calculateDiscount,
  classifyWeight,
  calculateShippingFee,
  calculateNetTotal,
  validateCheckout
} from "../utils/pureFunctions.js";


const router = Router();



// ============================
// ADD ITEM TO CART
// POST /cart/items
// CUSTOMER ONLY
// ============================

router.post(
  "/items",
  authenticateToken,
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const { productId, quantity } = req.body;

      // 1. ตรวจสอบ Cart ของ Customer
      const { data: cart, error: cartError } = await supabase
        .from("carts")
        .select("cart_id, stage")
        .eq("user_id", user.user_id)
        .single();

      if (cartError || !cart) {
        return res.status(404).json({
          error: {
            code: "CART_NOT_FOUND",
            message: "Cart not found"
          }
        });
      }

      // 2. ตรวจสอบ Stage
      if (cart.stage !== "CART") {
        return res.status(403).json({
          error: {
            code: "OPERATION_NOT_ALLOWED",
            message: "Cannot add items in the current cart stage"
          }
        });
      }

      // 3. ค้นหาสินค้า
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("product_id, name, stock, status")
        .eq("product_id", productId)
        .maybeSingle();

      if (productError) {
        console.error("GET PRODUCT ERROR:", productError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 4. ค้นหารายการสินค้าเดิมใน Cart
      const { data: existingItem, error: itemError } = await supabase
        .from("cart_items")
        .select("cart_item_id, quantity")
        .eq("cart_id", cart.cart_id)
        .eq("product_id", productId)
        .maybeSingle();

      if (itemError) {
        console.error("GET CART ITEM ERROR:", itemError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 5. ตรวจสอบเงื่อนไขตาม FR-2.6
      const validationResult = validateQuantityChange({
        operation: "add",
        quantity,
        productExists: !!product,
        inCart: !!existingItem,
        available: product
          ? isProductAvailable(
              product.status === "ON_SALE",
              product.stock
            )
          : false,
        currentQtyInCart: existingItem?.quantity ?? 0,
        availableStock: product?.stock ?? 0
      });

      // 6. กรณี Validation ไม่ผ่าน
      if (validationResult !== "OK") {
        const statusCode =
          validationResult === "PRODUCT_NOT_FOUND" ? 404 :
          validationResult === "PRODUCT_UNAVAILABLE" ? 409 :
          validationResult === "INSUFFICIENT_STOCK" ? 409 :
          400;

        return res.status(statusCode).json({
          error: {
            code: validationResult,
            message: validationResult
          }
        });
      }

      // 7. คำนวณจำนวนสินค้าใหม่
      const newQuantity =
        (existingItem?.quantity ?? 0) + quantity;

      // 8. ถ้ามีสินค้าอยู่แล้ว ให้อัปเดตจำนวน
      if (existingItem) {
        const { error: updateError } = await supabase
          .from("cart_items")
          .update({
            quantity: newQuantity
          })
          .eq("cart_item_id", existingItem.cart_item_id);

        if (updateError) {
          console.error("UPDATE CART ITEM ERROR:", updateError);

          return res.status(500).json({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Internal server error"
            }
          });
        }
      } else {
        // 9. ถ้ายังไม่มีสินค้า ให้เพิ่มรายการใหม่
        const { error: insertError } = await supabase
          .from("cart_items")
          .insert({
            cart_id: cart.cart_id,
            product_id: productId,
            quantity: newQuantity
          });

        if (insertError) {
          console.error("INSERT CART ITEM ERROR:", insertError);

          return res.status(500).json({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Internal server error"
            }
          });
        }
      }

      // 10. ส่งผลลัพธ์กลับ
      return res.status(200).json({
        message: "Product added to cart successfully",
        productId,
        quantity: newQuantity
      });

    } catch (error) {
      console.error("ADD ITEM ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);

// ============================
// REMOVE ITEM FROM CART
// DELETE /cart/items/:productId
// CUSTOMER ONLY
// ============================

router.delete(
  "/items/:productId",
  authenticateToken,
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const { productId } = req.params;

      // 1. ตรวจสอบ Cart ของ Customer
      const { data: cart, error: cartError } = await supabase
        .from("carts")
        .select("cart_id, stage")
        .eq("user_id", user.user_id)
        .single();

      if (cartError || !cart) {
        return res.status(404).json({
          error: {
            code: "CART_NOT_FOUND",
            message: "Cart not found"
          }
        });
      }

      // 2. ตรวจสอบ Stage
      if (cart.stage !== "CART") {
        return res.status(403).json({
          error: {
            code: "OPERATION_NOT_ALLOWED",
            message: "Cannot remove items in the current cart stage"
          }
        });
      }

      // 3. ตรวจสอบรายการสินค้าใน Cart
      const { data: cartItems, error: itemsError } = await supabase
        .from("cart_items")
        .select("cart_item_id, product_id")
        .eq("cart_id", cart.cart_id);

      if (itemsError) {
        console.error("GET CART ITEMS ERROR:", itemsError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 4. ตรวจสอบว่า Cart ว่างหรือไม่
      if (!cartItems || cartItems.length === 0) {
        return res.status(400).json({
          error: {
            code: "CART_EMPTY",
            message: "ไม่มีสินค้าให้ลบ"
          }
        });
      }

      // 5. ค้นหาสินค้าที่ต้องการลบ
      const existingItem = cartItems.find(
        (item) => item.product_id === productId
      );

      if (!existingItem) {
        return res.status(404).json({
          error: {
            code: "ITEM_NOT_IN_CART",
            message: "ไม่พบสินค้าในตะกร้า"
          }
        });
      }

      // 6. ลบรายการสินค้าออกจาก Cart
      const { error: deleteError } = await supabase
        .from("cart_items")
        .delete()
        .eq("cart_item_id", existingItem.cart_item_id);

      if (deleteError) {
        console.error("DELETE CART ITEM ERROR:", deleteError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 7. ตรวจสอบว่ายังมีสินค้าเหลือหรือไม่
      const remainingItems = cartItems.filter(
        (item) => item.cart_item_id !== existingItem.cart_item_id
      );

      return res.status(200).json({
        message: remainingItems.length === 0
          ? "ตะกร้าว่าง"
          : "Product removed from cart successfully",
        productId
      });

    } catch (error) {
      console.error("REMOVE ITEM ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);

// ============================
// UPDATE ITEM QUANTITY
// PATCH /cart/items/:productId
// CUSTOMER ONLY
// ============================

router.patch(
  "/items/:productId",
  authenticateToken,
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const { productId } = req.params;
      const { quantity } = req.body;

      // 1. ตรวจสอบ Cart ของ Customer
      const { data: cart, error: cartError } = await supabase
        .from("carts")
        .select("cart_id, stage")
        .eq("user_id", user.user_id)
        .single();

      if (cartError || !cart) {
        return res.status(404).json({
          error: {
            code: "CART_NOT_FOUND",
            message: "Cart not found"
          }
        });
      }

      // 2. ตรวจสอบ Stage
      if (cart.stage !== "CART") {
        return res.status(403).json({
          error: {
            code: "OPERATION_NOT_ALLOWED",
            message: "Cannot update items in the current cart stage"
          }
        });
      }

      // 3. ตรวจสอบรายการสินค้าใน Cart
      const { data: existingItem, error: itemError } = await supabase
        .from("cart_items")
        .select("cart_item_id, product_id, quantity")
        .eq("cart_id", cart.cart_id)
        .eq("product_id", productId)
        .maybeSingle();

      if (itemError) {
        console.error("GET CART ITEM ERROR:", itemError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 4. ค้นหาสินค้า
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("product_id, stock, status")
        .eq("product_id", productId)
        .maybeSingle();

      if (productError) {
        console.error("GET PRODUCT ERROR:", productError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 5. ตรวจสอบเงื่อนไขตาม FR-2.6
      const validationResult = validateQuantityChange({
        operation: "update",
        quantity,
        productExists: !!product,
        inCart: !!existingItem,
        available: product
          ? isProductAvailable(
              product.status === "ON_SALE",
              product.stock
            )
          : false,
        currentQtyInCart: existingItem?.quantity ?? 0,
        availableStock: product?.stock ?? 0
      });

      // 6. กรณี Validation ไม่ผ่าน
      if (validationResult !== "OK") {
        const statusCode =
          validationResult === "ITEM_NOT_IN_CART" ? 404 :
          validationResult === "PRODUCT_UNAVAILABLE" ? 409 :
          validationResult === "INSUFFICIENT_STOCK" ? 409 :
          400;

        return res.status(statusCode).json({
          error: {
            code: validationResult,
            message: validationResult
          }
        });
      }

      // 7. อัปเดตจำนวนสินค้า
      const { error: updateError } = await supabase
        .from("cart_items")
        .update({
          quantity
        })
        .eq("cart_item_id", existingItem!.cart_item_id);

      if (updateError) {
        console.error("UPDATE CART ITEM ERROR:", updateError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 8. ส่งผลลัพธ์กลับ
      return res.status(200).json({
        message: "Product quantity updated successfully",
        productId,
        quantity
      });

    } catch (error) {
      console.error("UPDATE ITEM QUANTITY ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);

// ============================
// APPLY COUPON
// POST /cart/coupon
// CUSTOMER ONLY
// ============================

router.post(
  "/coupon",
  authenticateToken,
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const { code } = req.body;

      // ตรวจสอบ Coupon Code
      if (typeof code !== "string" || code.trim() === "") {
        return res.status(400).json({
          error: {
            code: "COUPON_INVALID",
            message: "COUPON_INVALID"
          }
        });
      }

      // 1. ตรวจสอบ Cart ของ Customer
      const { data: cart, error: cartError } = await supabase
        .from("carts")
        .select("cart_id, stage")
        .eq("user_id", user.user_id)
        .single();

      if (cartError || !cart) {
        return res.status(404).json({
          error: {
            code: "CART_NOT_FOUND",
            message: "Cart not found"
          }
        });
      }

      // 2. ตรวจสอบ Stage
      if (cart.stage !== "CART") {
        return res.status(403).json({
          error: {
            code: "OPERATION_NOT_ALLOWED",
            message: "Cannot apply coupon in the current cart stage"
          }
        });
      }

      // 3. ค้นหา Coupon ด้วย code แบบตรงตัวอักษร
      const { data: coupon, error: couponError } = await supabase
        .from("coupons")
        .select("code, percent, min_spend, status")
        .eq("code", code)
        .maybeSingle();

      if (couponError) {
        console.error("GET COUPON ERROR:", couponError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 4. ตรวจสอบว่ามี Coupon และเปิดใช้งานหรือไม่
      if (!coupon || coupon.status !== "ACTIVE") {
        return res.status(400).json({
          error: {
            code: "COUPON_INVALID",
            message: "COUPON_INVALID"
          }
        });
      }

      // 5. ผูก Coupon กับ Cart
      const { error: updateError } = await supabase
        .from("carts")
        .update({
          coupon_code: coupon.code
        })
        .eq("cart_id", cart.cart_id);

      if (updateError) {
        console.error("APPLY COUPON ERROR:", updateError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 6. ส่งผลลัพธ์กลับ
      return res.status(200).json({
        message: "Coupon applied successfully",
        coupon: {
          code: coupon.code,
          percent: coupon.percent,
          minSpend: coupon.min_spend
        }
      });

    } catch (error) {
      console.error("APPLY COUPON ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);

// ============================
// VIEW CART
// GET /cart
// CUSTOMER ONLY
// ============================

router.get(
  "/",
  authenticateToken,
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const user = (req as any).user;

      console.log("GET CART USER:", {
        user_id: user.user_id,
        username: user.username,
        role: user.role
      });

      // 1. ค้นหา Cart ของ Customer
      const { data: cart, error: cartError } = await supabase
        .from("carts")
        .select("cart_id, stage, coupon_code")
        .eq("user_id", user.user_id)
        .maybeSingle();

      if (cartError) {
        console.error("GET CART ERROR:", cartError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      if (!cart) {
        return res.status(404).json({
          error: {
            code: "CART_NOT_FOUND",
            message: "Cart not found"
          }
        });
      }

      // 2. ค้นหารายการสินค้าใน Cart
      const { data: cartItems, error: itemsError } = await supabase
        .from("cart_items")
        .select("cart_item_id, product_id, quantity")
        .eq("cart_id", cart.cart_id);

      if (itemsError) {
        console.error("GET CART ITEMS ERROR:", itemsError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 3. กรณี Cart ไม่มีสินค้า
      if (!cartItems || cartItems.length === 0) {
        return res.status(200).json({
          cartId: cart.cart_id,
          stage: cart.stage,
          items: [],
          subtotal: 0,
          couponCode: cart.coupon_code
        });
      }

      // 4. ดึงข้อมูลสินค้าปัจจุบันจาก Products
      const productIds = [
        ...new Set(cartItems.map((item) => item.product_id))
      ];

      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("product_id, name, price, stock, status, weight")
        .in("product_id", productIds);

      if (productsError) {
        console.error("GET PRODUCTS ERROR:", productsError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 5. จับคู่ Cart Items กับข้อมูล Products
      const items = cartItems.map((item) => {
        const product = products?.find(
          (p) => p.product_id === item.product_id
        );

        // กรณีไม่พบข้อมูลสินค้า
        if (!product) {
          return {
            productId: item.product_id,
            productName: null,
            unitPrice: null,
            quantity: item.quantity,
            availableStock: 0,
            weightGram: 0,
            isAvailable: false,
            subtotal: null
          };
        }

        const itemSubtotal = product.price * item.quantity;

        // ตรวจสอบสถานะสินค้าและจำนวน Stock
        const isAvailable =
          isProductAvailable(
            product.status === "ON_SALE",
            product.stock
          ) &&
          item.quantity <= product.stock;

        return {
          productId: product.product_id,
          productName: product.name,
          unitPrice: product.price,
          quantity: item.quantity,
          availableStock: product.stock,
          weightGram: product.weight,
          isAvailable,
          subtotal: itemSubtotal
        };
      });

      // 6. คำนวณยอดรวมสินค้า
      const subtotal = items.reduce(
        (total, item) => total + (item.subtotal ?? 0),
        0
      );

      // 7. ส่งข้อมูล Cart กลับ
      return res.status(200).json({
        cartId: cart.cart_id,
        stage: cart.stage,
        items,
        subtotal,
        couponCode: cart.coupon_code
      });

    } catch (error) {
      console.error("VIEW CART ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);

// ============================
// CHECKOUT CART
// POST /cart/checkout
// CUSTOMER ONLY
// ============================

router.post(
  "/checkout",
  authenticateToken,
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const { zone, speed } = req.body;

      // 1. ตรวจสอบ Cart ของ Customer
      const { data: cart, error: cartError } = await supabase
        .from("carts")
        .select("cart_id, stage, coupon_code")
        .eq("user_id", user.user_id)
        .maybeSingle();

      if (cartError) {
        console.error("GET CART ERROR:", cartError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      if (!cart) {
        return res.status(404).json({
          error: {
            code: "CART_NOT_FOUND",
            message: "Cart not found"
          }
        });
      }

      // 2. ตรวจสอบ Stage ของ Cart
      if (cart.stage !== "CART") {
        return res.status(403).json({
          error: {
            code: "OPERATION_NOT_ALLOWED",
            message: "Cannot checkout in the current cart stage"
          }
        });
      }

      // 3. ดึงรายการสินค้าใน Cart
      const { data: cartItems, error: itemsError } = await supabase
        .from("cart_items")
        .select("product_id, quantity")
        .eq("cart_id", cart.cart_id);

      if (itemsError) {
        console.error("GET CART ITEMS ERROR:", itemsError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 4. ดึงข้อมูลสินค้า
      const productIds = [
        ...new Set((cartItems ?? []).map((item) => item.product_id))
      ];

      const { data: products, error: productsError } = productIds.length > 0
        ? await supabase
            .from("products")
            .select("product_id, name, price, weight, stock, status")
            .in("product_id", productIds)
        : { data: [], error: null };

      if (productsError) {
        console.error("GET PRODUCTS ERROR:", productsError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      // 5. จับคู่ Cart Items กับ Products
      const lines = (cartItems ?? []).map((item) => {
        const product = products?.find(
          (p) => p.product_id === item.product_id
        );

        return {
          productId: item.product_id,
          productName: product?.name ?? null,
          unitPrice: product?.price ?? 0,
          quantity: item.quantity,
          weightGram: product?.weight ?? 0,
          available: product
            ? isProductAvailable(
                product.status === "ON_SALE",
                product.stock
              )
            : false,
          availableStock: product?.stock ?? 0
        };
      });

      // 6. คำนวณน้ำหนักรวม
      const totalWeightGram = calculateTotalWeight(
        lines.map((line) => ({
          weightGram: line.weightGram,
          quantity: line.quantity
        }))
      );

      // 7. ตรวจสอบ Checkout ตามลำดับ FR-5.2.1
      const validationResult = validateCheckout({
        zone,
        speed,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          available: line.available,
          availableStock: line.availableStock
        })),
        totalWeightGram
      });

      if (validationResult.result !== "OK") {
        const result = validationResult.result;

        if (result === "VALIDATION_ERROR") {
          return res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid zone or speed"
            }
          });
        }

        if (result === "CART_EMPTY") {
          return res.status(400).json({
            error: {
              code: "CART_EMPTY",
              message: "ไม่สามารถชำระเงินได้ ตะกร้าว่าง"
            }
          });
        }

        if (result === "ITEMS_UNAVAILABLE") {
          return res.status(409).json({
            error: {
              code: "ITEMS_UNAVAILABLE",
              message: "Some products are unavailable or have insufficient stock",
              productIds: validationResult.productIds
            }
          });
        }

        if (result === "WEIGHT_LIMIT_EXCEEDED") {
          return res.status(400).json({
            error: {
              code: "WEIGHT_LIMIT_EXCEEDED",
              message: "Total cart weight exceeds 20,000 grams"
            }
          });
        }
      }

      // 8. คำนวณ Subtotal
      const subtotal = calculateSubtotal(
        lines.map((line) => ({
          price: line.unitPrice,
          quantity: line.quantity
        }))
      );

      // 9. ดึง Member Tier ของ Customer
      const { data: customer, error: customerError } = await supabase
        .from("users")
        .select("member_tier")
        .eq("user_id", user.user_id)
        .maybeSingle();

      if (customerError || !customer) {
        console.error("GET CUSTOMER ERROR:", customerError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      const memberTier = customer.member_tier;

      if (memberTier !== "normal" && memberTier !== "prime") {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid member tier"
          }
        });
      }

      // 10. ดึง Coupon ที่ผูกกับ Cart
      let coupon = null;

      if (cart.coupon_code) {
        const { data: couponData, error: couponError } = await supabase
          .from("coupons")
          .select("code, percent, min_spend, status")
          .eq("code", cart.coupon_code)
          .maybeSingle();

        if (couponError) {
          console.error("GET COUPON ERROR:", couponError);

          return res.status(500).json({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Internal server error"
            }
          });
        }

        if (couponData) {
          coupon = {
            percent: couponData.percent,
            minSpend: couponData.min_spend,
            active: couponData.status === "ACTIVE"
          };
        }
      }

      // 11. คำนวณส่วนลด
      const discountResult = calculateDiscount(
        subtotal,
        memberTier,
        coupon
      );

      const discount = discountResult.discount;

            // 12. จำแนกน้ำหนักสินค้า
          const weightTier = classifyWeight(totalWeightGram);

      if (weightTier === "overLimit") {
        return res.status(400).json({
          error: {
            code: "WEIGHT_LIMIT_EXCEEDED",
            message: "Total cart weight exceeds 20,000 grams"
          }
        });
      }

      const shippingFee = calculateShippingFee(
        weightTier,
        zone,
        speed,
        memberTier
      );

      // 14. คำนวณยอดสุทธิ
      const total = calculateNetTotal(
        subtotal,
        discount,
        shippingFee
      );

      // 15. ตรวจสอบ Coupon ที่ใช้จริง
      const couponCodeUsed = discountResult.couponRemoved
        ? null
        : cart.coupon_code;

      // 16. เตรียมข้อมูลสินค้าเพื่อส่งเข้า RPC
      const rpcLines = lines.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        weightGram: line.weightGram
      }));

      // 17. สร้าง Order และปรับ Stock ผ่าน Database Transaction
      const { data: orderId, error: checkoutError } =
        await supabase.rpc("checkout_cart", {
          p_user_id: user.user_id,
          p_zone: zone,
          p_speed: speed,
          p_subtotal: subtotal,
          p_discount: discount,
          p_shipping_fee: shippingFee,
          p_total: total,
          p_coupon_code: couponCodeUsed,
          p_coupon_removed: discountResult.couponRemoved,
          p_lines: rpcLines
        });

      if (checkoutError) {
        console.error("CHECKOUT RPC ERROR:", checkoutError);

        const errorMessage = checkoutError.message ?? "";

        if (errorMessage.includes("OPERATION_NOT_ALLOWED")) {
          return res.status(403).json({
            error: {
              code: "OPERATION_NOT_ALLOWED",
              message: "Cannot checkout in the current cart stage"
            }
          });
        }

        if (errorMessage.includes("ITEMS_UNAVAILABLE")) {
          return res.status(409).json({
            error: {
              code: "ITEMS_UNAVAILABLE",
              message: "Some products are unavailable or have insufficient stock"
            }
          });
        }

        if (errorMessage.includes("CART_EMPTY")) {
          return res.status(400).json({
            error: {
              code: "CART_EMPTY",
              message: "ไม่สามารถชำระเงินได้ ตะกร้าว่าง"
            }
          });
        }

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Checkout failed"
          }
        });
      }
// 18. ส่งผลลัพธ์ Checkout กลับ
return res.status(201).json({
  message: "Checkout successful",
  order: {
    orderId: formatOrderId(orderId),
    status: "PENDING_PAYMENT",
    subtotal,
    discount,
    shippingFee,
    total,
    zone,
    speed,
    couponCode: couponCodeUsed
  },
  ...(discountResult.couponRemoved
    ? {
        notice: {
          code: "COUPON_NOT_APPLICABLE",
          message: "คูปองไม่สามารถใช้กับคำสั่งซื้อนี้"
        }
      }
    : {})
});

    } catch (error) {
      console.error("CHECKOUT ERROR:", error);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      });
    }
  }
);

// ============================
// CONTINUE SHOPPING
// POST /cart/continue-shopping
// CUSTOMER ONLY
// ============================

router.post(
  "/continue-shopping",
  authenticateToken,
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const user = (req as any).user;

      // 1. ค้นหา Cart ของ Customer
      const { data: cart, error: cartError } = await supabase
        .from("carts")
        .select("cart_id, stage")
        .eq("user_id", user.user_id)
        .maybeSingle();

      if (cartError) {
        console.error("GET CART ERROR:", cartError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      if (!cart) {
        return res.status(404).json({
          error: {
            code: "CART_NOT_FOUND",
            message: "Cart not found"
          }
        });
      }

      // 2. ต้องเป็น SUCCESS เท่านั้น
      if (cart.stage !== "SUCCESS") {
      return res.status(403).json({
        error: {
          code: "OPERATION_NOT_ALLOWED",
          message: "Cannot continue shopping in the current cart stage"
    }
  });
}

      // 3. เปลี่ยน Cart กลับเป็น CART
      const { data: updatedCart, error: updateError } = await supabase
        .from("carts")
        .update({
          stage: "CART"
        })
        .eq("cart_id", cart.cart_id)
        .eq("user_id", user.user_id)
        .eq("stage", "SUCCESS")
        .select("cart_id, stage")
        .maybeSingle();

      if (updateError) {
        console.error("CONTINUE SHOPPING ERROR:", updateError);

        return res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
          }
        });
      }

      if (!updatedCart) {
        return res.status(409).json({
          error: {
            code: "CART_STAGE_CHANGED",
            message: "Cart stage has changed"
          }
        });
      }

      // 4. ส่งผลลัพธ์กลับ
      return res.status(200).json({
        message: "Continue shopping successful",
        cart: {
          cartId: updatedCart.cart_id,
          stage: updatedCart.stage
        }
      });

    } catch (error) {
      console.error("CONTINUE SHOPPING ERROR:", error);

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
