
// ตรวจสอบว่าสินค้าพร้อมขายหรือไม่
export function isProductAvailable(
  isOnSale: boolean,
  availableStock: number
): boolean {
  return isOnSale && availableStock > 0;
}

// ตรวจสอบ quantity ตามลำดับ FR-2.6
export function validateQuantityChange(input: {
  operation: 'add' | 'update';
  quantity: unknown;
  productExists: boolean;
  inCart: boolean;
  available: boolean;
  currentQtyInCart: number;
  availableStock: number;
}):
  | 'OK'
  | 'VALIDATION_ERROR'
  | 'QTY_OUT_OF_RANGE'
  | 'PRODUCT_NOT_FOUND'
  | 'ITEM_NOT_IN_CART'
  | 'PRODUCT_UNAVAILABLE'
  | 'INSUFFICIENT_STOCK' {

  // ขั้นที่ 1: quantity ต้องเป็นจำนวนเต็ม
  if (
    typeof input.quantity !== 'number' ||
    !Number.isInteger(input.quantity)
  ) {
    return 'VALIDATION_ERROR';
  }

  // ขั้นที่ 2: quantity ต้องอยู่ในช่วง 1–10
  if (input.quantity < 1 || input.quantity > 10) {
    return 'QTY_OUT_OF_RANGE';
  }

  // ขั้นที่ 3: ตรวจสอบสินค้า
  if (input.operation === 'add' && !input.productExists) {
    return 'PRODUCT_NOT_FOUND';
  }

  if (input.operation === 'update' && !input.inCart) {
    return 'ITEM_NOT_IN_CART';
  }

  // ขั้นที่ 4: สินค้าต้องพร้อมขาย
  if (!input.available) {
    return 'PRODUCT_UNAVAILABLE';
  }

  // คำนวณจำนวนสินค้าหลังดำเนินการ
  const newQuantity =
    input.operation === 'add'
      ? input.currentQtyInCart + input.quantity
      : input.quantity;

  // ขั้นที่ 5: เฉพาะ addItem จำนวนรวมต้องไม่เกิน 10
  if (input.operation === 'add' && newQuantity > 10) {
    return 'QTY_OUT_OF_RANGE';
  }

  // ขั้นที่ 6: จำนวนหลังดำเนินการต้องไม่เกินสต็อก
  if (newQuantity > input.availableStock) {
    return 'INSUFFICIENT_STOCK';
  }

  return 'OK';
}


// ========================================
// OP-8: Checkout Types
// ========================================

export type Zone = "inCity" | "upcountry" | "remote";
export type Speed = "standard" | "express";
export type MemberTier = "normal" | "prime";
export type WeightTier = "light" | "medium" | "heavy" | "overLimit";

// ========================================
// OP-8: Calculate Subtotal
// ========================================

export function calculateSubtotal(
  lines: { price: number; quantity: number }[]
): number {
  return lines.reduce(
    (total, line) => total + line.price * line.quantity,
    0
  );
}

// ========================================
// OP-8: Calculate Total Weight
// ========================================

export function calculateTotalWeight(
  lines: { weightGram: number; quantity: number }[]
): number {
  return lines.reduce(
    (total, line) => total + line.weightGram * line.quantity,
    0
  );
}

// ========================================
// OP-8: Classify Weight
// ========================================

export function classifyWeight(totalWeightGram: number): WeightTier {
  if (totalWeightGram > 20000) {
    return "overLimit";
  }

  if (totalWeightGram > 5000) {
    return "heavy";
  }

  if (totalWeightGram > 1000) {
    return "medium";
  }

  return "light";
}

// ========================================
// OP-8: Calculate Discount
// ========================================

export function calculateDiscount(
  subtotal: number,
  memberTier: MemberTier,
  coupon: { percent: number; minSpend: number; active: boolean } | null
): {
  discount: number;
  source: "coupon" | "member" | "none";
  couponRemoved: boolean;
} {
  if (coupon !== null) {
    if (coupon.active && subtotal >= coupon.minSpend) {
      return {
        discount: Math.floor(subtotal * coupon.percent / 100),
        source: "coupon",
        couponRemoved: false
      };
    }

    return {
      discount: memberTier === "prime"
        ? Math.floor(subtotal * 5 / 100)
        : 0,
      source: memberTier === "prime" ? "member" : "none",
      couponRemoved: true
    };
  }

  return {
    discount: memberTier === "prime"
      ? Math.floor(subtotal * 5 / 100)
      : 0,
    source: memberTier === "prime" ? "member" : "none",
    couponRemoved: false
  };
}

// ========================================
// OP-8: Calculate Shipping Fee
// ========================================

export function calculateShippingFee(
  weightTier: WeightTier,
  zone: Zone,
  speed: Speed,
  memberTier: MemberTier
): number {
  if (weightTier === "overLimit") {
    return 0;
  }

  const shippingRates = {
    light: { inCity: 30, upcountry: 50, remote: 80 },
    medium: { inCity: 50, upcountry: 80, remote: 120 },
    heavy: { inCity: 80, upcountry: 120, remote: 180 }
  };

  const baseFee = shippingRates[weightTier][zone];

  if (memberTier === "prime") {
    return speed === "standard" ? 0 : baseFee * 0.5;
  }

  return speed === "standard" ? baseFee : baseFee * 1.5;
}

// ========================================
// OP-8: Calculate Net Total
// ========================================

export function calculateNetTotal(
  subtotal: number,
  discount: number,
  shippingFee: number
): number {
  return subtotal - discount + shippingFee;
}

export type CheckoutValidationResult =
  | { result: "OK" }
  | { result: "VALIDATION_ERROR" }
  | { result: "CART_EMPTY" }
  | { result: "ITEMS_UNAVAILABLE"; productIds: string[] }
  | { result: "WEIGHT_LIMIT_EXCEEDED" };

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
}): CheckoutValidationResult {

  // ขั้นที่ 1: ตรวจสอบ zone และ speed
  const validZones = ["inCity", "upcountry", "remote"];
  const validSpeeds = ["standard", "express"];

  if (
    typeof input.zone !== "string" ||
    !validZones.includes(input.zone) ||
    typeof input.speed !== "string" ||
    !validSpeeds.includes(input.speed)
  ) {
    return { result: "VALIDATION_ERROR" };
  }

  // ขั้นที่ 2: ตรวจสอบว่าตะกร้ามีสินค้า
  if (input.lines.length === 0) {
    return { result: "CART_EMPTY" };
  }

  // ขั้นที่ 3: ตรวจสอบสินค้าทุกรายการ
  const unavailableItems = input.lines.filter(
    (line) =>
      !line.available ||
      line.quantity > line.availableStock
  );

  if (unavailableItems.length > 0) {
    return {
      result: "ITEMS_UNAVAILABLE",
      productIds: unavailableItems.map((line) => line.productId)
    };
  }

  // ขั้นที่ 4: ตรวจสอบน้ำหนักรวม
  if (input.totalWeightGram > 20000) {
    return { result: "WEIGHT_LIMIT_EXCEEDED" };
  }

  return { result: "OK" };
}

