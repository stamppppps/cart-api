
import { describe, it, expect } from "vitest";

import {
  isProductAvailable,
  validateQuantityChange,
  calculateSubtotal,
  calculateTotalWeight,
  classifyWeight,
  calculateDiscount,
  calculateShippingFee,
  calculateNetTotal,
  validateCheckout
} from "./cartValidation.js";

// ========================================
// Test: isProductAvailable
// ========================================

describe("isProductAvailable", () => {

  it("should return true when product is on sale and has stock", () => {
    expect(isProductAvailable(true, 10)).toBe(true);
  });

  it("should return false when product is not on sale", () => {
    expect(isProductAvailable(false, 10)).toBe(false);
  });

  it("should return false when stock is zero", () => {
    expect(isProductAvailable(true, 0)).toBe(false);
  });

});

// ========================================
// Test: validateQuantityChange
// ========================================

describe("validateQuantityChange", () => {

  // AC-1
  it("AC-1: should return QTY_OUT_OF_RANGE when quantity is 0", () => {
    const result = validateQuantityChange({
      operation: "add",
      quantity: 0,
      productExists: true,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 20
    });

    expect(result).toBe("QTY_OUT_OF_RANGE");
  });

  // AC-2
  it("AC-2: should return QTY_OUT_OF_RANGE when combined quantity exceeds 10", () => {
    const result = validateQuantityChange({
      operation: "add",
      quantity: 3,
      productExists: true,
      inCart: true,
      available: true,
      currentQtyInCart: 8,
      availableStock: 20
    });

    expect(result).toBe("QTY_OUT_OF_RANGE");
  });

  // AC-3
  it("AC-3: should return INSUFFICIENT_STOCK when combined quantity exceeds stock", () => {
    const result = validateQuantityChange({
      operation: "add",
      quantity: 2,
      productExists: true,
      inCart: true,
      available: true,
      currentQtyInCart: 2,
      availableStock: 3
    });

    expect(result).toBe("INSUFFICIENT_STOCK");
  });

  // Step 1
  it("should return VALIDATION_ERROR when quantity is not an integer", () => {
    const result = validateQuantityChange({
      operation: "add",
      quantity: 1.5,
      productExists: true,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 20
    });

    expect(result).toBe("VALIDATION_ERROR");
  });

  // Step 3
  it("should return PRODUCT_NOT_FOUND when product does not exist", () => {
    const result = validateQuantityChange({
      operation: "add",
      quantity: 1,
      productExists: false,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 20
    });

    expect(result).toBe("PRODUCT_NOT_FOUND");
  });

  // Step 4
  it("should return PRODUCT_UNAVAILABLE when product is unavailable", () => {
    const result = validateQuantityChange({
      operation: "add",
      quantity: 1,
      productExists: true,
      inCart: false,
      available: false,
      currentQtyInCart: 0,
      availableStock: 0
    });

    expect(result).toBe("PRODUCT_UNAVAILABLE");
  });

  // Update
  it("should return ITEM_NOT_IN_CART when updating an item not in cart", () => {
    const result = validateQuantityChange({
      operation: "update",
      quantity: 2,
      productExists: true,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 20
    });

    expect(result).toBe("ITEM_NOT_IN_CART");
  });

  // Success: Add
  it("should return OK when adding an item successfully", () => {
    const result = validateQuantityChange({
      operation: "add",
      quantity: 2,
      productExists: true,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 20
    });

    expect(result).toBe("OK");
  });

  // Success: Update
  it("should return OK when updating item quantity successfully", () => {
    const result = validateQuantityChange({
      operation: "update",
      quantity: 5,
      productExists: true,
      inCart: true,
      available: true,
      currentQtyInCart: 2,
      availableStock: 20
    });

    expect(result).toBe("OK");
  });

});

// ========================================
// OP-8: Checkout Calculation
// ========================================

describe("OP-8: Checkout Calculation", () => {

  it("should calculate subtotal correctly", () => {
    expect(calculateSubtotal([
      { price: 450, quantity: 2 },
      { price: 750, quantity: 1 }
    ])).toBe(1650);
  });

  it("should calculate total weight correctly", () => {
    expect(calculateTotalWeight([
      { weightGram: 300, quantity: 2 },
      { weightGram: 600, quantity: 1 }
    ])).toBe(1200);
  });

  it("should classify weight correctly", () => {
    expect(classifyWeight(600)).toBe("light");
    expect(classifyWeight(1200)).toBe("medium");
    expect(classifyWeight(8000)).toBe("heavy");
    expect(classifyWeight(20001)).toBe("overLimit");
  });

  it("should use coupon discount instead of member discount", () => {
    expect(calculateDiscount(1650, "prime", {
      percent: 10,
      minSpend: 1000,
      active: true
    })).toEqual({
      discount: 165,
      source: "coupon",
      couponRemoved: false
    });
  });

  it("should calculate prime member discount without coupon", () => {
    expect(calculateDiscount(1650, "prime", null)).toEqual({
      discount: 82,
      source: "member",
      couponRemoved: false
    });
  });

  it("should remove coupon when subtotal is below minimum spend", () => {
    expect(calculateDiscount(900, "prime", {
      percent: 10,
      minSpend: 1000,
      active: true
    })).toEqual({
      discount: 45,
      source: "member",
      couponRemoved: true
    });
  });

  it("should calculate shipping fee for normal customer", () => {
    expect(calculateShippingFee(
      "heavy", "remote", "express", "normal"
    )).toBe(270);
  });

  it("should calculate shipping fee for prime customer", () => {
    expect(calculateShippingFee(
      "medium", "upcountry", "express", "prime"
    )).toBe(40);
  });

  it("should calculate net total correctly", () => {
    expect(calculateNetTotal(1650, 165, 0)).toBe(1485);
  });

});

// ========================================
// OP-8: validateCheckout
// ========================================

describe("OP-8: validateCheckout", () => {

  const validInput = {
    zone: "inCity",
    speed: "standard",
    lines: [{
      productId: "P1",
      quantity: 2,
      available: true,
      availableStock: 20
    }],
    totalWeightGram: 600
  };

  it("should return OK for valid checkout", () => {
    expect(validateCheckout(validInput)).toEqual({
      result: "OK"
    });
  });

  it("should return VALIDATION_ERROR for invalid zone", () => {
    expect(validateCheckout({
      ...validInput,
      zone: "invalid"
    })).toEqual({
      result: "VALIDATION_ERROR"
    });
  });

  it("should return CART_EMPTY for empty cart", () => {
    expect(validateCheckout({
      ...validInput,
      lines: []
    })).toEqual({
      result: "CART_EMPTY"
    });
  });

  it("should return ITEMS_UNAVAILABLE for unavailable product", () => {
    expect(validateCheckout({
      ...validInput,
      lines: [{
        productId: "P1",
        quantity: 1,
        available: false,
        availableStock: 20
      }]
    })).toEqual({
      result: "ITEMS_UNAVAILABLE",
      productIds: ["P1"]
    });
  });

  it("should return ITEMS_UNAVAILABLE when quantity exceeds stock", () => {
    expect(validateCheckout({
      ...validInput,
      lines: [{
        productId: "P1",
        quantity: 3,
        available: true,
        availableStock: 2
      }]
    })).toEqual({
      result: "ITEMS_UNAVAILABLE",
      productIds: ["P1"]
    });
  });

  it("should return all unavailable product IDs", () => {
    expect(validateCheckout({
      ...validInput,
      lines: [
        {
          productId: "P1",
          quantity: 2,
          available: false,
          availableStock: 20
        },
        {
          productId: "P2",
          quantity: 5,
          available: true,
          availableStock: 2
        }
      ]
    })).toEqual({
      result: "ITEMS_UNAVAILABLE",
      productIds: ["P1", "P2"]
    });
  });

  it("should return WEIGHT_LIMIT_EXCEEDED when weight exceeds 20000g", () => {
    expect(validateCheckout({
      ...validInput,
      totalWeightGram: 24000
    })).toEqual({
      result: "WEIGHT_LIMIT_EXCEEDED"
    });
  });

  it("should check empty cart before weight limit", () => {
    expect(validateCheckout({
      ...validInput,
      lines: [],
      totalWeightGram: 24000
    })).toEqual({
      result: "CART_EMPTY"
    });
  });

});
