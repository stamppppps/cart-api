
import "./config/env.js";

import express from "express";
import cors from "cors";

import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";

import {
  authenticateToken,
  authorizeRole
} from "./middleware/authMiddleware.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/cart", cartRoutes);
app.use("/orders", orderRoutes);
app.use("/coupons", couponRoutes);

// Customer Test
app.get(
  "/test/customer",
  authenticateToken,
  authorizeRole("customer"),
  (req, res) => {
    return res.status(200).json({
      message: "Customer access granted"
    });
  }
);

// Admin Test
app.get(
  "/test/admin",
  authenticateToken,
  authorizeRole("admin"),
  (req, res) => {
    return res.status(200).json({
      message: "Admin access granted"
    });
  }
);

// Root Test
app.get("/", (req, res) => {
  return res.json({
    message: "Cart API is running"
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
