import jwt from "jsonwebtoken";
import redis from "../config/redis.js";
import { AuthenticationError, ForbiddenError } from "../utils/errors.js";

/**
 * 1. Authenticate Middleware
 * Verifies JWT and checks Redis for revocation.
 * Adds user info (including ROLE) to req.user.
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("Unauthorized: No token provided");
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (err) {
      throw new AuthenticationError("Invalid or expired token");
    }

    // Check Redis (Revocation check)
    const storedToken = await redis.get(`access_token:${decoded.id}`);
    if (!storedToken || storedToken !== token) {
      throw new AuthenticationError("Session expired or token revoked");
    }

    // ✅ Attach 'role' from the decoded token to req.user
    // Ensure your generateAccessToken() in utils/tokens.js includes 'role'
    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role || "USER",
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * 2. Authorization Middleware (RBAC)
 * Restricts access to specific roles.
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // Check if user is authenticated and has a role
    if (!req.user || !req.user.role) {
      return next(new AuthenticationError("User role not found."));
    }

    // Check if role is allowed
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError("Access denied. Admin permission required.")
      );
    }

    next();
  };
};
