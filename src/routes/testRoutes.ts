
import { Router } from "express";
import { isTestEnvironment } from "../config/env.js";
import { resetTestDatabase } from "../services/testDatabaseService.js";

const router = Router();

// ป้องกันไม่ให้ใช้งาน Test API นอก Test Environment
router.use((req, res, next) => {
  if (!isTestEnvironment) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found"
      }
    });
  }

  next();
});

// Reset Test Database
router.post("/reset", async (req, res) => {
  try {
    const data = await resetTestDatabase();

    return res.status(200).json({
      message: "Test database reset successfully",
      data
    });
  } catch (error) {
    console.error("RESET TEST DATABASE ERROR:", error);

    return res.status(500).json({
      error: {
        code: "TEST_RESET_FAILED",
        message: "Unable to reset test database"
      }
    });
  }
});

export default router;
