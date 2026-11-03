/**
 * แปลง Database Order ID เป็นรูปแบบ ORD-000001
 */
export function formatOrderId(orderId: number | string): string {
  const numericId = Number(orderId);

  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new Error("INVALID_ORDER_ID");
  }

  return `ORD-${String(numericId).padStart(6, "0")}`;
}

/**
 * แปลง ORD-000001 กลับเป็น Database Order ID = 1
 * รองรับเลขแบบเดิม เช่น "1"
 */
export function parseOrderId(
  value: string | string[] | undefined
): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (/^ORD-\d{6,}$/i.test(trimmedValue)) {
    const numericId = Number(trimmedValue.slice(4));

    return Number.isSafeInteger(numericId) && numericId > 0
      ? numericId
      : null;
  }

  if (/^\d+$/.test(trimmedValue)) {
    const numericId = Number(trimmedValue);

    return Number.isSafeInteger(numericId) && numericId > 0
      ? numericId
      : null;
  }

  return null;
}