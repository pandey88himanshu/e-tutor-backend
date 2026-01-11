import redis from "../config/redis.js";
import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL = 60 * 15; // 15 minutes

export class TokenService {
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
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  }
}
