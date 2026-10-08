import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

import { supabase } from "./config/supabase.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET!;

// ============================
// LOGIN
// ============================

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // ตรวจว่ามีข้อมูลส่งมาครบไหม
    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required"
      });
    }

    // ค้นหา User จาก Supabase
    const { data: user, error } = await supabase
      .from("users")
      .select("user_id, username, password, role")
      .eq("username", username)
      .single();

    console.log("LOGIN USERNAME:", username);
    console.log("USER FROM SUPABASE:", user);
    console.log("SUPABASE ERROR:", error);

    // ไม่พบ user
    if (error || !user) {
      return res.status(401).json({
        message: "Invalid username or password"
      });
    }

    // ตรวจ password
    if (user.password !== password) {
      return res.status(401).json({
        message: "Invalid username or password"
      });
    }

    // สร้าง JWT
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      {
        expiresIn: "1h"
      }
    );

    // ส่งข้อมูลกลับ
    return res.status(200).json({
      message: "Login successful",
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role
      },
      access_token: token
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

// ============================
// JWT MIDDLEWARE
// ============================

const authenticateToken = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {

  const authHeader = req.headers.authorization;

  // ไม่มี Token
  if (!authHeader) {
    return res.status(401).json({
      message: "Access token is required"
    });
  }

  // ต้องเป็น Bearer Token
  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({
      message: "Invalid authorization format"
    });
  }

  const token = parts[1];

  try {

    const decoded = jwt.verify(token, JWT_SECRET);

    // เก็บข้อมูล User ที่ถอดจาก JWT
    (req as any).user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      message: "Invalid or expired token"
    });

  }
};

// ============================
// CART TEST
// ต้อง Login ก่อน
// ============================

app.get("/cart", authenticateToken, (req, res) => {

  return res.status(200).json({
    message: "You can access cart",
    user: (req as any).user
  });

});

// ============================
// TEST
// ============================

app.get("/", (req, res) => {

  res.json({
    message: "Cart API is running"
  });

});

// ============================
// START SERVER
// ============================

app.listen(PORT, () => {

  console.log(
    `Server running on http://localhost:${PORT}`
  );

});