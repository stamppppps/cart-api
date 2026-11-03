import { describe, expect, it } from "vitest";

// ปรับ path นี้ให้ตรงกับตำแหน่งไฟล์ business logic ของโปรเจกต์
import {
  calculateDiscount,
  calculateNetTotal,
  calculateShippingFee,
  calculateSubtotal,
  calculateTotalWeight,
  classifyWeight,
  isProductAvailable,
  validateCheckout,
  validateProductUpdate,
  validateQuantityChange,
} from "./pureFunctions.js";

describe("isProductAvailable", () => {
  it.each([
    [true, 20, true], //UT-001
    [true, 1, true], //UT-002
    [true, 0, false], //UT-003
    [false, 20, false], //UT-004
    [false, 0, false], //UT-005
  ])("isProductAvailable(%s, %s) => %s", (isOnSale, stock, expected) => {
    expect(isProductAvailable(isOnSale, stock)).toBe(expected);
  });
});

describe("validateQuantityChange", () => {
  const addInput = {
    operation: "add" as const,
    productExists: true,
    inCart: false,
    available: true,
    currentQtyInCart: 0,
    availableStock: 20,
  };

  it.each([
    [1, "OK"], //UT-006,UT-007
    [10, "OK"], //UT-008
    [0, "QTY_OUT_OF_RANGE"], //UT-009
    [11, "QTY_OUT_OF_RANGE"], //UT-010
    [1.5, "VALIDATION_ERROR"], //UT-011
    ["2", "VALIDATION_ERROR"], //UT-012
  ])("add quantity=%s => %s", (quantity, expected) => {
    expect(validateQuantityChange({ ...addInput, quantity })).toBe(expected);
  });

  it("returns PRODUCT_NOT_FOUND when adding an unknown product", () => {
    expect(
      validateQuantityChange({
        ...addInput,
        quantity: 1,
        productExists: false,
        available: false,
      }),
    ).toBe("PRODUCT_NOT_FOUND"); //UT-013
  });

  it("returns PRODUCT_UNAVAILABLE when product is not available", () => {
    expect(
      validateQuantityChange({
        ...addInput,
        quantity: 1,
        available: false,
      }),
    ).toBe("PRODUCT_UNAVAILABLE"); //UT-015
  });

  it("returns ITEM_NOT_IN_CART when updating a line not in cart", () => {
    expect(
      validateQuantityChange({
        operation: "update",
        quantity: 1,
        productExists: true,
        inCart: false,
        available: true,
        currentQtyInCart: 0,
        availableStock: 20,
      }),
    ).toBe("ITEM_NOT_IN_CART"); //UT-014
  });

  it.each([
    [8, 2, 20, "OK"], // รวมเท่ากับ 10 (UT-016)
    [8, 3, 20, "QTY_OUT_OF_RANGE"], // รวมเป็น 11 (UT-017)
    [2, 2, 3, "INSUFFICIENT_STOCK"], // รวม 4 แต่ stock 3 (UT-018)
    [2, 1, 3, "OK"], // รวมเท่ากับ stock (UT-019)
  ])(
    "add existing line current=%s, requested=%s, stock=%s => %s",
    (currentQtyInCart, quantity, availableStock, expected) => {
      expect(
        validateQuantityChange({
          operation: "add",
          quantity,
          productExists: true,
          inCart: true,
          available: true,
          currentQtyInCart,
          availableStock,
        }),
      ).toBe(expected);
    },
  );

  it("returns OK for a valid quantity update", () => {
    expect(
      validateQuantityChange({
        operation: "update",
        quantity: 3,
        productExists: true,
        inCart: true,
        available: true,
        currentQtyInCart: 2,
        availableStock: 20,
      }),
    ).toBe("OK");
  });

  it("checks quantity format before product existence", () => {
    expect(
      validateQuantityChange({
        ...addInput,
        quantity: 1.5,
        productExists: false,
        available: false,
      }),
    ).toBe("VALIDATION_ERROR");
  });

  it("checks quantity range before product existence", () => {
    expect(
      validateQuantityChange({
        ...addInput,
        quantity: 0,
        productExists: false,
        available: false,
      }),
    ).toBe("QTY_OUT_OF_RANGE");
  });
});

describe("calculateSubtotal", () => {
  it.each([
    [[{ price: 450, quantity: 2 }], 900],
    [
      [
        { price: 450, quantity: 2 },
        { price: 1200, quantity: 1 },
      ],
      2100,
    ],
    [[], 0],
    [[{ price: 450, quantity: 3 }], 1350],
  ])("calculates subtotal", (lines, expected) => {
    expect(calculateSubtotal(lines)).toBe(expected);
  });
});

describe("calculateTotalWeight", () => {
  it.each([
    [[{ weightGram: 300, quantity: 2 }], 600],
    [
      [
        { weightGram: 300, quantity: 2 },
        { weightGram: 900, quantity: 1 },
      ],
      1500,
    ],
    [[], 0],
    [[{ weightGram: 8000, quantity: 2 }], 16000],
  ])("calculates total weight", (lines, expected) => {
    expect(calculateTotalWeight(lines)).toBe(expected);
  });
});

describe("calculateDiscount", () => {
  it.each([
    [
      1500,
      "normal",
      null,
      { discount: 0, source: "none", couponRemoved: false },
    ],
    [
      1500,
      "prime",
      null,
      { discount: 75, source: "member", couponRemoved: false },
    ],
    [
      1650,
      "prime",
      { percent: 10, minSpend: 1000, active: true },
      { discount: 165, source: "coupon", couponRemoved: false },
    ],
    [
      1000,
      "normal",
      { percent: 10, minSpend: 1000, active: true },
      { discount: 100, source: "coupon", couponRemoved: false },
    ],
    [
      999,
      "normal",
      { percent: 10, minSpend: 1000, active: true },
      { discount: 0, source: "none", couponRemoved: true },
    ],
    [
      900,
      "prime",
      { percent: 10, minSpend: 1000, active: true },
      { discount: 45, source: "member", couponRemoved: true },
    ],
    [
      1500,
      "normal",
      { percent: 10, minSpend: 1000, active: false },
      { discount: 0, source: "none", couponRemoved: true },
    ],
    [
      1500,
      "prime",
      { percent: 10, minSpend: 1000, active: false },
      { discount: 75, source: "member", couponRemoved: true },
    ],
    [
      999,
      "prime",
      null,
      { discount: 49, source: "member", couponRemoved: false },
    ],
  ])("returns the expected discount result", (subtotal, memberTier, coupon, expected) => {
    expect(calculateDiscount(subtotal, memberTier, coupon)).toEqual(expected);
  });
});

describe("classifyWeight", () => {
  it.each([
    [1, "light"],
    [1000, "light"],
    [1001, "medium"],
    [5000, "medium"],
    [5001, "heavy"],
    [20000, "heavy"],
    [20001, "overLimit"],
  ])("classifyWeight(%s) => %s", (weight, expected) => {
    expect(classifyWeight(weight)).toBe(expected);
  });

  // SRS ไม่ได้กำหนด expected result สำหรับน้ำหนัก 0 กรัม
  // จึงไม่เขียน assertion ที่คาดเดาพฤติกรรมในกรณีนี้
});

describe("calculateShippingFee", () => {
  const baseRate = {
    light: { inCity: 30, upcountry: 50, remote: 80 },
    medium: { inCity: 50, upcountry: 80, remote: 120 },
    heavy: { inCity: 80, upcountry: 120, remote: 180 },
  } as const;

  const cases = (["light", "medium", "heavy"] as const).flatMap((weightTier) =>
    (["inCity", "upcountry", "remote"] as const).flatMap((zone) =>
      (["standard", "express"] as const).flatMap((speed) =>
        (["normal", "prime"] as const).map((memberTier) => {
          const base = baseRate[weightTier][zone];
          const expected =
            memberTier === "normal"
              ? speed === "standard"
                ? base
                : Math.floor((base * 3) / 2)
              : speed === "standard"
                ? 0
                : Math.floor(base / 2);

          return [weightTier, zone, speed, memberTier, expected] as const;
        }),
      ),
    ),
  );

  it.each(cases)(
    "%s / %s / %s / %s => %s baht",
    (weightTier, zone, speed, memberTier, expected) => {
      expect(
        calculateShippingFee(weightTier, zone, speed, memberTier),
      ).toBe(expected);
    },
  );
});

describe("calculateNetTotal", () => {
  it.each([
    [2100, 165, 50, 1985],
    [450, 0, 30, 480],
    [1000, 1000, 0, 0],
    [1500, 75, 120, 1545],
  ])("calculates net total", (subtotal, discount, shippingFee, expected) => {
    expect(calculateNetTotal(subtotal, discount, shippingFee)).toBe(expected);
  });
});

describe("validateCheckout", () => {
  const validLine = {
    productId: "P1",
    quantity: 1,
    available: true,
    availableStock: 20,
  };

  it("returns OK for valid checkout data", () => {
    expect(
      validateCheckout({
        zone: "inCity",
        speed: "standard",
        lines: [validLine],
        totalWeightGram: 300,
      }),
    ).toEqual({ result: "OK" });
  });

  it.each([
    ["invalid zone", "bad", "standard", [validLine], 300, { result: "VALIDATION_ERROR" }],
    ["invalid speed", "inCity", "fast", [validLine], 300, { result: "VALIDATION_ERROR" }],
    ["empty cart", "inCity", "standard", [], 0, { result: "CART_EMPTY" }],
    ["weight at limit", "inCity", "standard", [validLine], 20000, { result: "OK" }],
    [
      "weight above limit",
      "inCity",
      "standard",
      [validLine],
      20001,
      { result: "WEIGHT_LIMIT_EXCEEDED" },
    ],
  ])("%s", (_label, zone, speed, lines, totalWeightGram, expected) => {
    expect(
      validateCheckout({ zone, speed, lines, totalWeightGram }),
    ).toEqual(expected);
  });

  it("returns every unavailable product id", () => {
    expect(
      validateCheckout({
        zone: "inCity",
        speed: "standard",
        lines: [
          { productId: "P1", quantity: 1, available: false, availableStock: 0 },
          { productId: "P2", quantity: 1, available: true, availableStock: 3 },
          { productId: "P3", quantity: 1, available: false, availableStock: 5 },
        ],
        totalWeightGram: 900,
      }),
    ).toEqual({ result: "ITEMS_UNAVAILABLE", productIds: ["P1", "P3"] });
  });

  it("validates zone/speed before checking whether cart is empty", () => {
    expect(
      validateCheckout({
        zone: "bad",
        speed: "standard",
        lines: [],
        totalWeightGram: 0,
      }),
    ).toEqual({ result: "VALIDATION_ERROR" });
  });

  it("checks empty cart before weight limit", () => {
    expect(
      validateCheckout({
        zone: "inCity",
        speed: "standard",
        lines: [],
        totalWeightGram: 20001,
      }),
    ).toEqual({ result: "CART_EMPTY" });
  });
});

describe("validateProductUpdate", () => {
  it.each([
    [{ price: 1200, stock: 5 }, []],
    [{ price: 1 }, []],
    [{ price: 50000 }, []],
    [{ price: 0 }, ["price"]],
    [{ price: 50001 }, ["price"]],
    [{ price: 100.5 }, ["price"]],
    [{ stock: 0 }, []],
    [{ stock: 9999 }, []],
    [{ stock: -1 }, ["stock"]],
    [{ stock: 10000 }, ["stock"]],
    [{ stock: "5" }, ["stock"]],
    [{}, ["price", "stock"]],
    [{ price: 0, stock: 5 }, ["price"]],
    [{ price: 1200, stock: 10000 }, ["stock"]],
    [{ price: 0, stock: -1 }, ["price", "stock"]],
  ])("validateProductUpdate(%j) => %j", (input, expected) => {
    expect(validateProductUpdate(input)).toEqual(expected);
  });
});
