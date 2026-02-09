import redis from "../config/redis.js";
import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL = 60 * 15; // 15 minutes

export class TokenService {
  // ✅ ADDED: Generate Access Token
  generateAccessToken(user) {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role, // Crucial for Admin checks
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRE || "15m" }
    );
  }

  // ✅ ADDED: Generate Refresh Token
  generateRefreshToken(user) {
    return jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRE || "7d",
    });
  }

  // --- Existing Storage Methods ---

  async storeAccessToken(userId, accessToken) {
    await redis.set(`access_token:${userId}`, accessToken, {
      ex: ACCESS_TOKEN_TTL,
    });
  }

  async deleteAccessToken(userId) {
    await redis.del(`access_token:${userId}`);
  }

  async getAccessToken(userId) {
    return await redis.get(`access_token:${userId}`);
  }

  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    } catch (error) {
      throw new Error("Invalid refresh token");
    }
  }

  createCookieOptions() {
    const isProduction = process.env.NODE_ENV === "production";
    console.log(`🍪 Cookie options - NODE_ENV: ${process.env.NODE_ENV}, isProduction: ${isProduction}`);
    return {
      httpOnly: true,
      secure: isProduction, // Required when sameSite is "none"
      sameSite: isProduction ? "none" : "lax", // "none" for cross-origin in production
      path: "/", // Cookie accessible on all routes
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  }
}
