import jwt from "jsonwebtoken";
import redis from "../config/redis.js";
import { AuthenticationError } from "../utils/errors.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("Unauthorized");
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (err) {
      // Token expired or invalid
      throw new AuthenticationError("Invalid or expired token");
    }

    // Check token against Redis
    const storedToken = await redis.get(`access_token:${decoded.id}`);
    if (!storedToken || storedToken !== token) {
      throw new AuthenticationError("Token revoked");
    }

    // Attach user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
    };

    next();
  } catch (err) {
    next(err);
  }
};
