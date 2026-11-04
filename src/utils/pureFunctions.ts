// ======================================================
// SRS-CART-002 v1.8
// Pure Functions (DC-1)
// ======================================================

// ------------------------------------------------------
// 1. Types
// ------------------------------------------------------

export type Zone = "inCity" | "upcountry" | "remote";

export type Speed = "standard" | "express";

export type MemberTier = "normal" | "prime";

export type WeightTier =
  | "light"
  | "medium"
  | "heavy"
  | "overLimit";

export type QuantityChangeResult =
  | "OK"
  | "VALIDATION_ERROR"
  | "QTY_OUT_OF_RANGE"
  | "PRODUCT_NOT_FOUND"
  | "ITEM_NOT_IN_CART"
  | "PRODUCT_UNAVAILABLE"
  | "INSUFFICIENT_STOCK";

export interface CartLine {
  price: number;
  quantity: number;
}

export interface WeightLine {
  weightGram: number;
  quantity: number;
}

// ======================================================
// GROUP 1: PRODUCT & CART
// ======================================================

// ------------------------------------------------------
// 2. isProductAvailable
// นิยามสินค้าพร้อมขาย
// สินค้าต้องเปิดขาย และมี stock มากกว่า 0
// ------------------------------------------------------

export function isProductAvailable(
  isOnSale: boolean,
  availableStock: number
): boolean {
  return isOnSale && availableStock > 0;
}

// ------------------------------------------------------
// 3. validateQuantityChange
// ตรวจสอบจำนวนสินค้าในการเพิ่มหรือแก้ไขตะกร้า
// ------------------------------------------------------

export function validateQuantityChange(input: {
  operation: "add" | "update";
  quantity: unknown;
  productExists: boolean;
  inCart: boolean;
  available: boolean;
  currentQtyInCart: number;
  availableStock: number;
}): QuantityChangeResult {
  const {
    operation,
    quantity,
    productExists,
    inCart,
    available,
    currentQtyInCart,
    availableStock,
  } = input;

  // Step 1: ต้องเป็น Number และจำนวนเต็ม
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity)
  ) {
    return "VALIDATION_ERROR";
  }

  // Step 2: จำนวนต้องอยู่ระหว่าง 1-10
  if (quantity < 1 || quantity > 10) {
    return "QTY_OUT_OF_RANGE";
  }

  // Step 3: ตรวจสอบว่าสินค้ามีอยู่หรืออยู่ในตะกร้า
  if (operation === "add" && !productExists) {
    return "PRODUCT_NOT_FOUND";
  }

  if (operation === "update" && !inCart) {
    return "ITEM_NOT_IN_CART";
  }

  // Step 4: ตรวจสอบความพร้อมขาย
  if (!available) {
    return "PRODUCT_UNAVAILABLE";
  }

  // Step 5: ตรวจสอบจำนวนรวมไม่เกิน 10
  if (
    operation === "add" &&
    inCart &&
    currentQtyInCart + quantity > 10
  ) {
    return "QTY_OUT_OF_RANGE";
  }

  // Step 6: ตรวจสอบจำนวนรวมไม่เกิน stock
  const totalQuantity =
    operation === "add" && inCart
      ? currentQtyInCart + quantity
      : quantity;

  if (totalQuantity > availableStock) {
    return "INSUFFICIENT_STOCK";
  }

  return "OK";
}

// ======================================================
// GROUP 2: PRICE CALCULATION
// ======================================================

// ------------------------------------------------------
// 4. calculateSubtotal
// คำนวณยอดรวมราคาสินค้า
// สูตร: price × quantity
// ------------------------------------------------------

export function calculateSubtotal(
  lines: CartLine[]
): number {
  return lines.reduce(
    (total, line) =>
      total + line.price * line.quantity,
    0
  );
}

// ------------------------------------------------------
// 5. calculateTotalWeight
// คำนวณน้ำหนักรวมของสินค้า
// สูตร: weightGram × quantity
// ------------------------------------------------------

export function calculateTotalWeight(
  lines: WeightLine[]
): number {
  return lines.reduce(
    (total, line) =>
      total + line.weightGram * line.quantity,
    0
  );
}

// ------------------------------------------------------
// 6. calculateDiscount
// คำนวณส่วนลดจาก Coupon หรือ Member
//
// Priority:
// 1. Coupon ที่ใช้งานได้และยอดถึง minSpend
// 2. Member prime ลด 5%
// 3. ไม่มีส่วนลด
//
// ปัดเศษลงด้วย Math.floor()
// ------------------------------------------------------

export function calculateDiscount(
  subtotal: number,
  memberTier: MemberTier,
  coupon: {
    percent: number;
    minSpend: number;
    active: boolean;
  } | null
): {
  discount: number;
  source: "coupon" | "member" | "none";
  couponRemoved: boolean;
} {
  // ตรวจสอบ Coupon ก่อน
  if (coupon !== null) {
    // Coupon ใช้ได้เมื่อ active และยอดถึง minSpend
    if (
      coupon.active &&
      subtotal >= coupon.minSpend
    ) {
      const discount = Math.floor(
        (subtotal * coupon.percent) / 100
      );

      return {
        discount,
        source: "coupon",
        couponRemoved: false,
      };
    }

    // Coupon ใช้ไม่ได้ ต้องถอด Coupon
    if (memberTier === "prime") {
      return {
        discount: Math.floor(subtotal * 0.05),
        source: "member",
        couponRemoved: true,
      };
    }

    return {
      discount: 0,
      source: "none",
      couponRemoved: true,
    };
  }

  // ไม่มี Coupon แต่เป็นสมาชิก prime
  if (memberTier === "prime") {
    return {
      discount: Math.floor(subtotal * 0.05),
      source: "member",
      couponRemoved: false,
    };
  }

  // ไม่มีส่วนลด
  return {
    discount: 0,
    source: "none",
    couponRemoved: false,
  };
}

// ------------------------------------------------------
// 7. classifyWeight
// แบ่งประเภทน้ำหนักสินค้า
//
// light      = 1 - 1,000 g
// medium     = 1,001 - 5,000 g
// heavy      = 5,001 - 20,000 g
// overLimit  = มากกว่า 20,000 g
// ------------------------------------------------------

export function classifyWeight(
  totalWeightGram: number
): WeightTier {
  if (totalWeightGram <= 1000) {
    return "light";
  }

  if (totalWeightGram <= 5000) {
    return "medium";
  }

  if (totalWeightGram <= 20000) {
    return "heavy";
  }

  return "overLimit";
}

// ------------------------------------------------------
// 8. calculateShippingFee
// คำนวณค่าจัดส่งตามน้ำหนัก พื้นที่ ความเร็ว และสมาชิก
//
// Normal + Standard = Base
// Normal + Express  = Base × 1.5
// Prime + Standard  = 0
// Prime + Express   = Base × 0.5
// ------------------------------------------------------

export function calculateShippingFee(
  weightTier: Exclude<WeightTier, "overLimit">,
  zone: Zone,
  speed: Speed,
  memberTier: MemberTier
): number {
  const shippingRates = {
    light: {
      inCity: 30,
      upcountry: 50,
      remote: 80,
    },
    medium: {
      inCity: 50,
      upcountry: 80,
      remote: 120,
    },
    heavy: {
      inCity: 80,
      upcountry: 120,
      remote: 180,
    },
  };

  const baseFee = shippingRates[weightTier][zone];

  // สมาชิก prime ส่งแบบ standard ฟรี
  if (
    memberTier === "prime" &&
    speed === "standard"
  ) {
    return 0;
  }

  // สมาชิก prime ส่งแบบ express จ่ายครึ่งราคา
  if (
    memberTier === "prime" &&
    speed === "express"
  ) {
    return Math.floor(baseFee * 0.5);
  }

  // สมาชิก normal ส่งแบบ express จ่าย 1.5 เท่า
  if (speed === "express") {
    return Math.floor(baseFee * 1.5);
  }

  // สมาชิก normal ส่งแบบ standard จ่ายราคาปกติ
  return baseFee;
}

// ------------------------------------------------------
// 9. calculateNetTotal
// คำนวณยอดสุทธิ
//
// สูตร:
// Net Total = Subtotal - Discount + Shipping Fee
// ------------------------------------------------------

export function calculateNetTotal(
  subtotal: number,
  discount: number,
  shippingFee: number
): number {
  return subtotal - discount + shippingFee;
}

// ======================================================
// GROUP 3: CHECKOUT VALIDATION
// ======================================================

// ------------------------------------------------------
// 10. validateCheckout
// ตรวจสอบข้อมูลก่อน Checkout
//
// ลำดับการตรวจสอบ:
// 1. ตรวจสอบ zone และ speed
// 2. ตรวจสอบว่าตะกร้ามีสินค้าหรือไม่
// 3. ตรวจสอบสินค้าที่ไม่พร้อมขายทั้งหมด
// 4. ตรวจสอบน้ำหนักรวมไม่เกิน 20,000 g
// ------------------------------------------------------

export function validateCheckout(input: {
  zone: unknown;
  speed: unknown;
  lines: {
    productId: string;
    quantity: number;
    available: boolean;
    availableStock: number;
  }[];
  totalWeightGram: number;
}):
  | { result: "OK" }
  | {
      result:
        | "VALIDATION_ERROR"
        | "CART_EMPTY"
        | "WEIGHT_LIMIT_EXCEEDED";
    }
  | {
      result: "ITEMS_UNAVAILABLE";
      productIds: string[];
    } {
  const {
    zone,
    speed,
    lines,
    totalWeightGram,
  } = input;

  // Step 1: ตรวจสอบ zone และ speed
  const validZones: Zone[] = [
    "inCity",
    "upcountry",
    "remote",
  ];

  const validSpeeds: Speed[] = [
    "standard",
    "express",
  ];

  if (
    !validZones.includes(zone as Zone) ||
    !validSpeeds.includes(speed as Speed)
  ) {
    return {
      result: "VALIDATION_ERROR",
    };
  }

  // Step 2: ตรวจสอบตะกร้าว่าง
  if (lines.length === 0) {
    return {
      result: "CART_EMPTY",
    };
  }

  // Step 3: ตรวจสอบสินค้าที่ไม่พร้อมขายทั้งหมด
  const unavailableProductIds = lines
    .filter((line) => !line.available)
    .map((line) => line.productId);

  if (unavailableProductIds.length > 0) {
    return {
      result: "ITEMS_UNAVAILABLE",
      productIds: unavailableProductIds,
    };
  }

  // Step 4: ตรวจสอบน้ำหนักเกินกำหนด
  if (totalWeightGram > 20000) {
    return {
      result: "WEIGHT_LIMIT_EXCEEDED",
    };
  }

  return {
    result: "OK",
  };
}

// ======================================================
// GROUP 4: ADMIN PRODUCT VALIDATION
// ======================================================

// ------------------------------------------------------
// 11. validateProductUpdate
// ตรวจสอบข้อมูลก่อนแก้ไขสินค้า
//
// Price: 1 - 50,000 บาท (จำนวนเต็ม)
// Stock: 0 - 9,999 (จำนวนเต็ม)
//
// คืนชื่อ field ที่ไม่ผ่านทั้งหมด
// ------------------------------------------------------

export function validateProductUpdate(
  input: {
    price?: unknown;
    stock?: unknown;
  }
): ("price" | "stock")[] {
  const invalidFields: ("price" | "stock")[] = [];

  // กรณีไม่มี field ที่ต้องการแก้ไข
  if (
    input.price === undefined &&
    input.stock === undefined
  ) {
    return ["price", "stock"];
  }

  // ตรวจสอบ Price
  if (input.price !== undefined) {
    if (
      typeof input.price !== "number" ||
      !Number.isInteger(input.price) ||
      input.price < 1 ||
      input.price > 50000
    ) {
      invalidFields.push("price");
    }
  }

  // ตรวจสอบ Stock
  if (input.stock !== undefined) {
    if (
      typeof input.stock !== "number" ||
      !Number.isInteger(input.stock) ||
      input.stock < 0 ||
      input.stock > 9999
    ) {
      invalidFields.push("stock");
    }
  }

  return invalidFields;
}