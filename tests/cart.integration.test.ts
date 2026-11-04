import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../src/app.js";
import { supabase } from "../src/config/supabase.js";
import { resetTestDatabase } from "./helpers/resetTestDatabase.js";



const BASE = "/cart";
const NORMAL = { username: "cus_normal", password: "normal123" };
const PRIME = { username: "cus_prime", password: "prime123" };
const ADMIN = { username: "admin01", password: "admin123" };

let normalToken = "";
let primeToken = "";
let adminToken = "";

async function login(credentials: { username: string; password: string }) {
  const response = await request(app).post("/auth/login").send(credentials);
  expect(response.status).toBe(200);
  expect(response.body.token).toBeTruthy();
  return response.body.token as string;
}

async function userId(username: string): Promise<number> {
  const { data, error } = await supabase
    .from("users")
    .select("user_id")
    .eq("username", username)
    .single();

  if (error || !data) throw new Error(`Cannot find test user ${username}: ${error?.message}`);
  return data.user_id;
}

async function cartFor(username = NORMAL.username) {
  const id = await userId(username);
  const { data, error } = await supabase
    .from("carts")
    .select("cart_id, user_id, stage, coupon_code")
    .eq("user_id", id)
    .single();

  if (error || !data) throw new Error(`Cannot find cart for ${username}: ${error?.message}`);
  return data;
}

async function seedItem(productId: string, quantity: number, username = NORMAL.username) {
  const cart = await cartFor(username);

  const { data: existing, error: findError } = await supabase
    .from("cart_items")
    .select("cart_item_id, quantity")
    .eq("cart_id", cart.cart_id)
    .eq("product_id", productId)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from("cart_items")
      .update({ quantity })
      .eq("cart_item_id", existing.cart_item_id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("cart_items")
      .insert({ cart_id: cart.cart_id, product_id: productId, quantity });
    if (error) throw error;
  }
}

async function itemQuantity(productId: string, username = NORMAL.username) {
  const cart = await cartFor(username);
  const { data, error } = await supabase
    .from("cart_items")
    .select("quantity")
    .eq("cart_id", cart.cart_id)
    .eq("product_id", productId)
    .maybeSingle();

  if (error) throw error;
  return data?.quantity ?? 0;
}

async function setProduct(productId: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from("products")
    .update(patch)
    .eq("product_id", productId);
  if (error) throw error;
}

async function setCartStage(stage: string, username = NORMAL.username) {
  const cart = await cartFor(username);
  const { error } = await supabase
    .from("carts")
    .update({ stage })
    .eq("cart_id", cart.cart_id);
  if (error) throw error;
}

async function setCouponStatus(status: string) {
  const { error } = await supabase
    .from("coupons")
    .update({ status })
    .eq("code", "SAVE10");
  if (error) throw error;
}

function auth(token = normalToken) {
  return { Authorization: `Bearer ${token}` };
}

function expectError(response: any, code: string) {
  expect(response.body?.error?.code).toBe(code);
}

async function add(productId = "P1", quantity: unknown = 1, token = normalToken) {
  return request(app).post(`${BASE}/items`).set(auth(token)).send({ productId, quantity });
}

async function checkout(
  zone = "inCity",
  speed = "standard",
  token = normalToken
) {
  return request(app).post(`${BASE}/checkout`).set(auth(token)).send({ zone, speed });
}

async function applyCoupon(code = "SAVE10", token = normalToken) {
  return request(app).post(`${BASE}/coupon`).set(auth(token)).send({ code });
}

async function assertCheckout(
  response: any,
  expected: { subtotal: number; discount: number; shippingFee: number; total: number }
) {
  expect(response.status).toBe(201);
  expect(response.body.order).toMatchObject(expected);
}

describe("Cart API Integration Tests (100 cases)", () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  beforeEach(async () => {
    // afterEach restores the seed data; login again to obtain fresh tokens.
    normalToken = await login(NORMAL);
    primeToken = await login(PRIME);
    adminToken = await login(ADMIN);
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  // ---------------------------------------------------------------------------
  // HAPPY PATHS — H01 to H19
  // ---------------------------------------------------------------------------
  describe("Happy Path", () => {
    it("H01 GET /cart returns an empty cart", async () => {
      const response = await request(app).get(BASE).set(auth());
      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
      expect(response.body.subtotal).toBe(0);
    });

    it("H02 adds a product to an empty cart", async () => {
      const response = await add("P1", 1);
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(1);
    });

    it("H03 adds the same product and sums quantity", async () => {
      await seedItem("P1", 1);
      const response = await add("P1", 2);
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(3);
    });

    it("H04 adds a different product to the same cart", async () => {
      await seedItem("P1", 1);
      const response = await add("P2", 1);
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(1);
      expect(await itemQuantity("P2")).toBe(1);
    });

    it("H05 updates an existing item quantity", async () => {
      await seedItem("P1", 1);
      const response = await request(app)
        .patch(`${BASE}/items/P1`).set(auth()).send({ quantity: 3 });
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(3);
    });

    it("H06 removes one item while another item remains", async () => {
      await seedItem("P1", 1);
      await seedItem("P2", 1);
      const response = await request(app).delete(`${BASE}/items/P1`).set(auth());
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(0);
      expect(await itemQuantity("P2")).toBe(1);
    });

    it("H07 removes the last item and leaves the cart empty", async () => {
      await seedItem("P1", 1);
      const response = await request(app).delete(`${BASE}/items/P1`).set(auth());
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(0);
    });

    it("H08 applies an active coupon", async () => {
      const response = await applyCoupon();
      expect(response.status).toBe(200);
      expect(response.body.coupon.code).toBe("SAVE10");
      expect((await cartFor()).coupon_code).toBe("SAVE10");
    });

    it("H09 applying the same coupon again keeps the coupon attached", async () => {
      await applyCoupon();
      const response = await applyCoupon();
      expect(response.status).toBe(200);
      expect((await cartFor()).coupon_code).toBe("SAVE10");
    });

    it("H10 applies a coupon while the cart is empty", async () => {
      const response = await applyCoupon();
      expect(response.status).toBe(200);
      expect((await cartFor()).coupon_code).toBe("SAVE10");
    });

    it("H11 GET /cart returns product details and subtotal", async () => {
      await seedItem("P1", 2);
      const response = await request(app).get(BASE).set(auth());
      expect(response.status).toBe(200);
      expect(response.body.subtotal).toBe(900);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]).toMatchObject({
        productId: "P1", quantity: 2, unitPrice: 450, subtotal: 900
      });
    });

    it("H12 checks normal customer, light weight, inCity standard shipping", async () => {
      await seedItem("P1", 2); // subtotal 900, weight 600g, light base 30
      const response = await checkout("inCity", "standard");
      await assertCheckout(response, {
        subtotal: 900, discount: 0, shippingFee: 30, total: 930
      });
    });

    it("H13 checks SAVE10 coupon on P2 and inCity standard shipping", async () => {
      await seedItem("P2", 1); // subtotal 1200, weight 900g, shipping 30
      await applyCoupon();
      const response = await checkout("inCity", "standard");
      await assertCheckout(response, {
        subtotal: 1200, discount: 120, shippingFee: 30, total: 1110
      });
    });

    it("H14 checks Prime member discount with inCity standard shipping", async () => {
      await seedItem("P1", 2, PRIME.username);
      const response = await checkout("inCity", "standard", primeToken);
      await assertCheckout(response, {
        subtotal: 900, discount: 45, shippingFee: 0, total: 855
      });
    });

    it("H15 checks normal customer inCity express shipping", async () => {
      await seedItem("P1", 2);
      const response = await checkout("inCity", "express");
      await assertCheckout(response, {
        subtotal: 900, discount: 0, shippingFee: 45, total: 945
      });
    });

    it("H16 checks normal customer upcountry standard shipping", async () => {
      await seedItem("P1", 2);
      const response = await checkout("upcountry", "standard");
      await assertCheckout(response, {
        subtotal: 900, discount: 0, shippingFee: 50, total: 950
      });
    });

    it("H17 checks normal customer remote standard shipping", async () => {
      await seedItem("P1", 2);
      const response = await checkout("remote", "standard");
      await assertCheckout(response, {
        subtotal: 900, discount: 0, shippingFee: 80, total: 980
      });
    });

    it("H18 removes SAVE10 when subtotal is below minSpend", async () => {
      await seedItem("P1", 2); // subtotal 900 < 1000
      await applyCoupon();
      const response = await checkout("inCity", "standard");
      await assertCheckout(response, {
        subtotal: 900, discount: 0, shippingFee: 30, total: 930
      });
      expect(response.body.notice?.code).toBe("COUPON_NOT_APPLICABLE");
      expect(response.body.order.couponCode).toBeNull();
    });

    it("H19 continue-shopping changes SUCCESS cart back to CART", async () => {
      await setCartStage("SUCCESS");
      const response = await request(app)
        .post(`${BASE}/continue-shopping`).set(auth()).send({});
      expect(response.status).toBe(200);
      expect((await cartFor()).stage).toBe("CART");
    });
  });

  // ---------------------------------------------------------------------------
  // NEGATIVE — N01 to N49
  // ---------------------------------------------------------------------------
  describe("Negative", () => {
    it("N01 rejects GET /cart without a token", async () => {
      const response = await request(app).get(BASE);
      expect(response.status).toBe(401);
      expectError(response, "AUTH_REQUIRED");
    });

  it("N02 rejects an invalid JWT", async () => {
  const response = await request(app)
    .get(BASE)
    .set(auth("invalid-token"));

  expect(response.status).toBe(401);
  expectError(response, "AUTH_REQUIRED");
});

    it("N03 rejects an expired JWT", async () => {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error("JWT_SECRET is missing in test environment");
      const expired = jwt.sign({ user_id: 1, username: "cus_normal", role: "customer" }, secret, { expiresIn: -1 });
      const response = await request(app).get(BASE).set(auth(expired));
      expect(response.status).toBe(401);
    });

    it("N04 rejects ADMIN access to customer cart", async () => {
      const response = await request(app).get(BASE).set(auth(adminToken));
      expect(response.status).toBe(403);
      expectError(response, "AUTH_FORBIDDEN");
    });

    it("N05 rejects POST /cart/items without a token", async () => {
      const response = await request(app).post(`${BASE}/items`).send({ productId: "P1", quantity: 1 });
      expect(response.status).toBe(401);
    });

    it("N06 rejects PATCH /cart/items/:id without a token", async () => {
      const response = await request(app).patch(`${BASE}/items/P1`).send({ quantity: 2 });
      expect(response.status).toBe(401);
    });

    it("N07 rejects DELETE /cart/items/:id without a token", async () => {
      const response = await request(app).delete(`${BASE}/items/P1`);
      expect(response.status).toBe(401);
    });

    it("N08 rejects POST /cart/coupon without a token", async () => {
      const response = await request(app).post(`${BASE}/coupon`).send({ code: "SAVE10" });
      expect(response.status).toBe(401);
    });

    it("N09 rejects POST /cart/checkout without a token", async () => {
      const response = await request(app).post(`${BASE}/checkout`).send({ zone: "inCity", speed: "standard" });
      expect(response.status).toBe(401);
    });

    it("N10 rejects POST /cart/continue-shopping without a token", async () => {
      const response = await request(app).post(`${BASE}/continue-shopping`).send({});
      expect(response.status).toBe(401);
    });

    it("N11 rejects add item when productId is missing", async () => {
      const response = await request(app).post(`${BASE}/items`).set(auth()).send({ quantity: 1 });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await itemQuantity("P1")).toBe(0);
    });

    it("N12 rejects add item when quantity is missing", async () => {
      const response = await request(app).post(`${BASE}/items`).set(auth()).send({ productId: "P1" });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await itemQuantity("P1")).toBe(0);
    });

    it("N13 rejects quantity supplied as text", async () => {
      const response = await add("P1", "abc");
      expectError(response, "VALIDATION_ERROR");
    });

    it("N14 rejects decimal quantity", async () => {
      const response = await add("P1", 1.5);
      expectError(response, "VALIDATION_ERROR");
    });

    it("N15 rejects quantity zero", async () => {
      const response = await add("P1", 0);
      expectError(response, "QTY_OUT_OF_RANGE");
    });

    it("N16 rejects negative quantity", async () => {
      const response = await add("P1", -1);
      expectError(response, "QTY_OUT_OF_RANGE");
    });

    it("N17 rejects quantity greater than ten", async () => {
      const response = await add("P1", 11);
      expectError(response, "QTY_OUT_OF_RANGE");
    });

    it("N18 rejects an unknown product", async () => {
      const response = await add("PX999", 1);
      expectError(response, "PRODUCT_NOT_FOUND");
    });

    it("N19 rejects a product that is OFF_SALE", async () => {
      await setProduct("P1", { status: "OFF_SALE" });
      const response = await add("P1", 1);
      expectError(response, "PRODUCT_UNAVAILABLE");
    });

    it("N20 rejects a product with zero available stock", async () => {
      await setProduct("P1", { stock: 0 });
      const response = await add("P1", 1);
      expect(["PRODUCT_UNAVAILABLE", "INSUFFICIENT_STOCK"]).toContain(response.body?.error?.code);
    });

    it("N21 rejects duplicate add when resulting quantity exceeds ten", async () => {
      await seedItem("P1", 9);
      const response = await add("P1", 2);
      expectError(response, "QTY_OUT_OF_RANGE");
      expect(await itemQuantity("P1")).toBe(9);
    });

    it("N22 rejects duplicate add when resulting quantity exceeds stock", async () => {
      await seedItem("P2", 2);
      const response = await add("P2", 2);
      expectError(response, "INSUFFICIENT_STOCK");
      expect(await itemQuantity("P2")).toBe(2);
    });

    it("N23 rejects add while cart stage is not CART", async () => {
      await setCartStage("SUCCESS");
      const response = await add("P1", 1);
      expectError(response, "OPERATION_NOT_ALLOWED");
    });

    it("N24 rejects update when quantity is missing", async () => {
      await seedItem("P1", 1);
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({});
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("N25 rejects update quantity supplied as text", async () => {
      await seedItem("P1", 1);
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: "two" });
      expect(response.body?.error?.code).toBe("VALIDATION_ERROR");
    });

    it("N26 rejects decimal update quantity", async () => {
      await seedItem("P1", 1);
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: 2.5 });
      expect(response.body?.error?.code).toBe("VALIDATION_ERROR");
    });

    it("N27 rejects update quantity zero", async () => {
      await seedItem("P1", 1);
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: 0 });
      expect(response.body?.error?.code).toBe("QTY_OUT_OF_RANGE");
    });

    it("N28 rejects negative update quantity", async () => {
      await seedItem("P1", 1);
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: -1 });
      expect(response.body?.error?.code).toBe("QTY_OUT_OF_RANGE");
    });

    it("N29 rejects update quantity greater than ten", async () => {
      await seedItem("P1", 1);
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: 11 });
      expect(response.body?.error?.code).toBe("QTY_OUT_OF_RANGE");
    });

    it("N30 rejects removing a product not in the cart", async () => {
      // Arrange: มี P2 อยู่ในตะกร้า แต่ไม่มี P1
      await seedItem("P2", 1);

      // Act: พยายามลบ P1
      const response = await request(app)
        .delete(`${BASE}/items/P1`)
        .set(auth());

      // Assert
      expectError(response, "ITEM_NOT_IN_CART");

      // ตรวจสอบว่า P2 ยังอยู่ในตะกร้า
      expect(await itemQuantity("P2")).toBe(1);
    });

    it("N31 rejects removing an item from an empty cart", async () => {
      const response = await request(app).delete(`${BASE}/items/P1`).set(auth());
      expectError(response, "CART_EMPTY");
    });

    it("N32 rejects updating an item not in the cart", async () => {
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: 2 });
      expectError(response, "ITEM_NOT_IN_CART");
    });

    it("N33 rejects update quantity above available stock", async () => {
      await seedItem("P2", 1);
      const response = await request(app).patch(`${BASE}/items/P2`).set(auth()).send({ quantity: 4 });
      expectError(response, "INSUFFICIENT_STOCK");
    });

    it("N34 rejects updating a product that is no longer on sale", async () => {
      await seedItem("P1", 1);
      await setProduct("P1", { status: "OFF_SALE" });
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: 2 });
      expectError(response, "PRODUCT_UNAVAILABLE");
    });

    it("N35 rejects coupon request without code", async () => {
      const response = await request(app).post(`${BASE}/coupon`).set(auth()).send({});
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("N36 rejects unknown coupon code", async () => {
      const response = await applyCoupon("NOTEXIST");
      expectError(response, "COUPON_INVALID");
    });

    it("N37 rejects inactive coupon", async () => {
      await setCouponStatus("INACTIVE");
      const response = await applyCoupon();
      expectError(response, "COUPON_INVALID");
    });

    it("N38 rejects coupon code with wrong letter case", async () => {
      const response = await applyCoupon("save10");
      expectError(response, "COUPON_INVALID");
    });

    it("N39 rejects applying coupon outside CART stage", async () => {
      await setCartStage("SUCCESS");
      const response = await applyCoupon();
      expectError(response, "OPERATION_NOT_ALLOWED");
    });

    it("N40 rejects checkout without zone", async () => {
      await seedItem("P1", 1);
      const response = await request(app).post(`${BASE}/checkout`).set(auth()).send({ speed: "standard" });
      expect(response.body?.error?.code).toBe("VALIDATION_ERROR");
    });

    it("N41 rejects checkout without speed", async () => {
      await seedItem("P1", 1);
      const response = await request(app).post(`${BASE}/checkout`).set(auth()).send({ zone: "inCity" });
      expect(response.body?.error?.code).toBe("VALIDATION_ERROR");
    });

    it("N42 rejects unsupported delivery zone", async () => {
      await seedItem("P1", 1);
      const response = await checkout("unknown", "standard");
      expect(response.body?.error?.code).toBe("VALIDATION_ERROR");
    });

    it("N43 rejects unsupported delivery speed", async () => {
      await seedItem("P1", 1);
      const response = await checkout("inCity", "overnight");
      expect(response.body?.error?.code).toBe("VALIDATION_ERROR");
    });

    it("N44 rejects checkout for an empty cart", async () => {
      const response = await checkout();
      expectError(response, "CART_EMPTY");
    });

    it("N45 rejects checkout when a cart product becomes OFF_SALE", async () => {
      await seedItem("P1", 1);
      await setProduct("P1", { status: "OFF_SALE" });
      const response = await checkout();
      expectError(response, "ITEMS_UNAVAILABLE");
    });

    it("N46 rejects checkout when stock becomes insufficient", async () => {
      await seedItem("P2", 2);
      await setProduct("P2", { stock: 1 });
      const response = await checkout();
      expectError(response, "ITEMS_UNAVAILABLE");
    });

    it("N47 rejects checkout above 20,000 grams", async () => {
      await seedItem("P3", 3); // 24,000g; P3 stock is 5
      const response = await checkout();
      expectError(response, "WEIGHT_LIMIT_EXCEEDED");
      expect((await cartFor()).stage).toBe("CART");
      expect(await itemQuantity("P3")).toBe(3);
    });

    it("N48 rejects checkout outside CART stage", async () => {
      await seedItem("P1", 1);
      await setCartStage("SUCCESS");
      const response = await checkout();
      expectError(response, "OPERATION_NOT_ALLOWED");
    });

    it("N49 rejects continue-shopping before successful checkout", async () => {
      const response = await request(app).post(`${BASE}/continue-shopping`).set(auth()).send({});
      expectError(response, "OPERATION_NOT_ALLOWED");
    });

    it("N50 rejects login with unknown username", async () => {
    const response = await request(app)
    .post("/auth/login")
    .send({
      username: "unknown_user",
      password: "wrong123"
    });

  expect(response.status).toBe(401);
  expectError(response, "AUTH_INVALID_CREDENTIALS");
});

    it("N51 rejects login with incorrect password", async () => {
    const response = await request(app)
    .post("/auth/login")
    .send({
      username: NORMAL.username,
      password: "wrong_password"
    });

  expect(response.status).toBe(401);
  expectError(response, "AUTH_INVALID_CREDENTIALS");
});

  it("N52 rejects Admin status update for unknown coupon", async () => {
  const response = await request(app)
    .patch("/coupons/UNKNOWN_COUPON/status")
    .set(auth(adminToken))
    .send({ status: "ACTIVE" });

  expect(response.status).toBe(404);
  expectError(response, "COUPON_NOT_FOUND");
});
  it("N53 returns ORDER_NOT_FOUND for unknown order ID", async () => {
  const response = await request(app)
    .get("/orders/ORD-999999999999")
    .set(auth());

  expect(response.status).toBe(404);
  expect(response.body?.error?.code).toBe("ORDER_NOT_FOUND");
});
  });

  // ---------------------------------------------------------------------------
  // BOUNDARY — B01 to B25
  // ---------------------------------------------------------------------------
  describe("Boundary", () => {
    it("B01 quantity immediately below minimum (0) is rejected", async () => {
      const response = await add("P1", 0);
      expectError(response, "QTY_OUT_OF_RANGE");
    });

    it("B02 minimum quantity (1) is accepted", async () => {
      const response = await add("P1", 1);
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(1);
    });

    it("B03 maximum quantity (10) is accepted when stock allows", async () => {
      const response = await add("P1", 10);
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(10);
    });

    it("B04 quantity immediately above maximum (11) is rejected", async () => {
      const response = await add("P1", 11);
      expectError(response, "QTY_OUT_OF_RANGE");
    });

    it("B05 duplicate addition resulting in exactly 10 is accepted", async () => {
      await seedItem("P1", 8);
      const response = await add("P1", 2);
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(10);
    });

    it("B06 duplicate addition resulting in 11 is rejected", async () => {
      await seedItem("P1", 9);
      const response = await add("P1", 2);
      expectError(response, "QTY_OUT_OF_RANGE");
      expect(await itemQuantity("P1")).toBe(9);
    });

    it("B07 add quantity exactly equal to available stock", async () => {
      const response = await add("P2", 3);
      expect(response.status).toBe(200);
      expect(await itemQuantity("P2")).toBe(3);
    });

    it("B08 add one unit above available stock is rejected", async () => {
      const response = await add("P2", 4);
      expectError(response, "INSUFFICIENT_STOCK");
    });

    it("B09 update quantity immediately below minimum (0) is rejected", async () => {
      await seedItem("P1", 1);
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: 0 });
      expectError(response, "QTY_OUT_OF_RANGE");
    });

    it("B10 update to minimum quantity (1) is accepted", async () => {
      await seedItem("P1", 2);
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: 1 });
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(1);
    });

    it("B11 update to maximum quantity (10) is accepted", async () => {
      await seedItem("P1", 1);
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: 10 });
      expect(response.status).toBe(200);
      expect(await itemQuantity("P1")).toBe(10);
    });

    it("B12 update to 11 is rejected", async () => {
      await seedItem("P1", 1);
      const response = await request(app).patch(`${BASE}/items/P1`).set(auth()).send({ quantity: 11 });
      expectError(response, "QTY_OUT_OF_RANGE");
    });

    it("B13 coupon threshold immediately below minimum (999) is not applied", async () => {
      await setProduct("P1", { price: 499.5 });
      await seedItem("P1", 2);
      await applyCoupon();
      const response = await checkout();
      expect(response.status).toBe(201);
      expect(response.body.notice?.code).toBe("COUPON_NOT_APPLICABLE");
      expect(response.body.order.subtotal).toBe(999);
      expect(response.body.order.discount).toBe(0);
    });

    it("B14 coupon threshold exactly at minimum (1000) is applied", async () => {
      await setProduct("P1", { price: 500 });
      await seedItem("P1", 2);
      await applyCoupon();
      const response = await checkout();
      expect(response.status).toBe(201);
      expect(response.body.order.subtotal).toBe(1000);
      expect(response.body.order.discount).toBe(100);
    });

    it("B15 coupon threshold immediately above minimum (1001) is applied", async () => {
      await setProduct("P1", { price: 500.5 });
      await seedItem("P1", 2);
      await applyCoupon();
      const response = await checkout();
      expect(response.status).toBe(201);
      expect(response.body.order.subtotal).toBe(1001);
      expect(response.body.order.discount).toBe(100);
    });

  

    it("B16 total weight 1g is classified as light", async () => {
      await setProduct("P1", { weight: 1 });
      await seedItem("P1", 1);
      const response = await checkout();
      expect(response.status).toBe(201);
      expect(response.body.order.shippingFee).toBe(30);
    });

    it("B17 total weight 1,000g is classified as light", async () => {
      await setProduct("P1", { weight: 1000 });
      await seedItem("P1", 1);
      const response = await checkout();
      expect(response.status).toBe(201);
      expect(response.body.order.shippingFee).toBe(30);
    });

    it("B18 total weight 1,001g is classified as medium", async () => {
      await setProduct("P1", { weight: 1001 });
      await seedItem("P1", 1);
      const response = await checkout();
      expect(response.status).toBe(201);
      expect(response.body.order.shippingFee).toBe(50);
    });

    it("B19 total weight 5,000g is classified as medium", async () => {
      await setProduct("P1", { weight: 5000 });
      await seedItem("P1", 1);
      const response = await checkout();
      expect(response.status).toBe(201);
      expect(response.body.order.shippingFee).toBe(50);
    });

    it("B20 total weight 5,001g is classified as heavy", async () => {
      await setProduct("P1", { weight: 5001 });
      await seedItem("P1", 1);
      const response = await checkout();
      expect(response.status).toBe(201);
      expect(response.body.order.shippingFee).toBe(80);
    });

    it("B21 total weight exactly 20,000g is accepted", async () => {
      await setProduct("P1", { weight: 20000 });
      await seedItem("P1", 1);
      const response = await checkout();
      expect(response.status).toBe(201);
      expect(response.body.order.shippingFee).toBe(80);
    });

    it("B22 total weight 20,001g is rejected", async () => {
      await setProduct("P1", { weight: 20001 });
      await seedItem("P1", 1);
      const response = await checkout();
      expectError(response, "WEIGHT_LIMIT_EXCEEDED");
    });

    it("B23 zero subtotal / empty cart is rejected as CART_EMPTY", async () => {
      const response = await checkout();
      expectError(response, "CART_EMPTY");
    });

    it("B24 checkout succeeds when stock equals requested quantity", async () => {
      await seedItem("P2", 3);
      const response = await checkout();
      expect(response.status).toBe(201);
      expect(response.body.order.subtotal).toBe(3600);
      expect(response.body.order.shippingFee).toBe(50); // medium, normal, inCity standard
      expect(response.body.order.total).toBe(3650);
      const { data: product, error } = await supabase
        .from("products").select("stock").eq("product_id", "P2").single();
      if (error) throw error;
      expect(product.stock).toBe(0);
    });
  });
});


// ==================================================
// PAYMENT INTEGRATION TESTS (4 cases)
// ==================================================

const PAYMENT_BASE = "/cart";
const PAYMENT_NORMAL = { username: "cus_normal", password: "normal123" };

let paymentNormalToken = "";

function paymentAuth() {
  return { Authorization: `Bearer ${paymentNormalToken}` };
}

async function paymentLogin() {
  const response = await request(app)
    .post("/auth/login")
    .send(PAYMENT_NORMAL);

  expect(response.status).toBe(200);
  expect(response.body.token).toBeTruthy();

  return response.body.token as string;
}

async function paymentGetUserId(): Promise<number> {
  const { data, error } = await supabase
    .from("users")
    .select("user_id")
    .eq("username", PAYMENT_NORMAL.username)
    .single();

  if (error || !data) {
    throw new Error(`Cannot find test user: ${error?.message}`);
  }

  return data.user_id;
}

async function paymentGetCart() {
  const userId = await paymentGetUserId();

  const { data, error } = await supabase
    .from("carts")
    .select("cart_id, stage, coupon_code")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error(`Cannot find cart: ${error?.message}`);
  }

  return data;
}

async function paymentGetStock(productId = "P1"): Promise<number> {
  const { data, error } = await supabase
    .from("products")
    .select("stock")
    .eq("product_id", productId)
    .single();

  if (error || !data) {
    throw new Error(`Cannot find product: ${error?.message}`);
  }

  return data.stock;
}

async function paymentGetItemQuantity(productId = "P1"): Promise<number> {
  const cart = await paymentGetCart();

  const { data, error } = await supabase
    .from("cart_items")
    .select("quantity")
    .eq("cart_id", cart.cart_id)
    .eq("product_id", productId)
    .maybeSingle();

  if (error) throw error;

  return data?.quantity ?? 0;
}

async function paymentCreatePendingOrder() {
  const addResponse = await request(app)
    .post(`${PAYMENT_BASE}/items`)
    .set(paymentAuth())
    .send({
      productId: "P1",
      quantity: 1
    });

  expect(addResponse.status).toBe(200);

  const checkoutResponse = await request(app)
    .post(`${PAYMENT_BASE}/checkout`)
    .set(paymentAuth())
    .send({
      zone: "inCity",
      speed: "standard"
    });

  expect(checkoutResponse.status).toBe(201);
  expect(checkoutResponse.body.order.status).toBe("PENDING_PAYMENT");
  expect(checkoutResponse.body.order.orderId).toBeTruthy();

  return checkoutResponse.body.order.orderId as string;
}

async function paymentGetOrder(orderId: string) {
  const response = await request(app)
    .get(`/orders/${orderId}`)
    .set(paymentAuth());

  expect(response.status).toBe(200);

  return response.body.order;
}

describe("Payment API Integration Tests", () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  beforeEach(async () => {
    paymentNormalToken = await paymentLogin();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  // --------------------------------------------------
  // PAYMENT SUCCESS
  // --------------------------------------------------

  it("P01 pays successfully and changes Order status to PAID", async () => {
    const orderId = await paymentCreatePendingOrder();

    const response = await request(app)
      .post(`/orders/${orderId}/pay-success`)
      .set(paymentAuth());

    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe("PAID");
    expect(response.body.cart.stage).toBe("SUCCESS");
    expect(response.body.cart.items).toEqual([]);
    expect(response.body.cart.couponCode).toBeNull();

    const order = await paymentGetOrder(orderId);
    expect(order.status).toBe("PAID");

    const cart = await paymentGetCart();
    expect(cart.stage).toBe("SUCCESS");
    expect(cart.coupon_code).toBeNull();

    expect(await paymentGetItemQuantity()).toBe(0);
  });

  // --------------------------------------------------
  // PAYMENT FAIL
  // --------------------------------------------------

  it("P02 payment failure keeps Order, Cart and Stock unchanged", async () => {
    const stockBefore = await paymentGetStock();

    const orderId = await paymentCreatePendingOrder();

    const stockAfterCheckout = await paymentGetStock();

    const cartBefore = await paymentGetCart();
    const orderBefore = await paymentGetOrder(orderId);
    const quantityBefore = await paymentGetItemQuantity();

    expect(stockAfterCheckout).toBe(stockBefore - 1);
    expect(cartBefore.stage).toBe("CHECKOUT");
    expect(orderBefore.status).toBe("PENDING_PAYMENT");
    expect(quantityBefore).toBe(1);

    const response = await request(app)
      .post(`/orders/${orderId}/pay-fail`)
      .set(paymentAuth());

    expect(response.status).toBe(200);

    const cartAfter = await paymentGetCart();
    const orderAfter = await paymentGetOrder(orderId);

    expect(cartAfter.stage).toBe("CHECKOUT");
    expect(orderAfter.status).toBe("PENDING_PAYMENT");
    expect(await paymentGetStock()).toBe(stockAfterCheckout);
    expect(await paymentGetItemQuantity()).toBe(quantityBefore);
  });

  // --------------------------------------------------
  // PAYMENT RETRY
  // --------------------------------------------------

  it("P03 allows payment retry after a failed payment", async () => {
    const orderId = await paymentCreatePendingOrder();

    const failResponse = await request(app)
      .post(`/orders/${orderId}/pay-fail`)
      .set(paymentAuth());

    expect(failResponse.status).toBe(200);

    const retryResponse = await request(app)
      .post(`/orders/${orderId}/pay-success`)
      .set(paymentAuth());

    expect(retryResponse.status).toBe(200);
    expect(retryResponse.body.order.status).toBe("PAID");

    const order = await paymentGetOrder(orderId);
    expect(order.status).toBe("PAID");

    const cart = await paymentGetCart();
    expect(cart.stage).toBe("SUCCESS");
    expect(await paymentGetItemQuantity()).toBe(0);
  });

  // --------------------------------------------------
  // CANCEL CHECKOUT
  // --------------------------------------------------

  it("P04 cancels checkout and restores Stock and Cart", async () => {
    const stockBefore = await paymentGetStock();

    const orderId = await paymentCreatePendingOrder();

    expect(await paymentGetStock()).toBe(stockBefore - 1);

    const response = await request(app)
      .post(`/orders/${orderId}/cancel`)
      .set(paymentAuth());

    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe("CANCELLED");

    const order = await paymentGetOrder(orderId);
    expect(order.status).toBe("CANCELLED");

    const cart = await paymentGetCart();

    expect(cart.stage).toBe("CART");
    expect(await paymentGetStock()).toBe(stockBefore);
    expect(await paymentGetItemQuantity()).toBe(1);
  });
});
