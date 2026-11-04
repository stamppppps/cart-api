import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

import app from "../src/app.js";
import { resetTestDatabase } from "../src/services/testDatabaseService.js";

// Mock ฟังก์ชัน Reset เพื่อไม่ให้เรียก Supabase จริง
vi.mock("../src/services/testDatabaseService.js", () => ({
  resetTestDatabase: vi.fn()
}));

describe("Test API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET / should return API running message", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Cart API is running"
    });
  });

  it("POST /test/reset should return success", async () => {
    vi.mocked(resetTestDatabase).mockResolvedValue({
      success: true
    });

    const response = await request(app).post("/test/reset");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Test database reset successfully",
      data: {
        success: true
      }
    });
  });

  it("POST /test/reset should return error when reset fails", async () => {
    vi.mocked(resetTestDatabase).mockRejectedValue(
      new Error("Database connection failed")
    );

    const response = await request(app).post("/test/reset");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "TEST_RESET_FAILED",
        message: "Unable to reset test database"
      }
    });
  });
});