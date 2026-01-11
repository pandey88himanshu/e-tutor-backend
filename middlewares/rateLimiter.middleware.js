// middleware/rateLimiter.js

import { RateLimitError } from "../utils/errors.js";

class RateLimiter {
  constructor() {
    // Store: { identifier: { count, resetTime, lastRequestTime } }
    this.requests = new Map();

    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Create a rate limiter middleware
   * @param {Object} options - Rate limiter options
   * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
   * @param {number} options.maxRequests - Max requests per window (default: 5)
   * @param {string} options.message - Error message (optional)
   * @param {Function} options.keyGenerator - Function to generate unique key (optional)
   * @param {boolean} options.skipSuccessfulRequests - Don't count successful requests (default: false)
   * @param {boolean} options.skipFailedRequests - Don't count failed requests (default: false)
   */
  createLimiter(options = {}) {
    const {
      windowMs = 60 * 1000, // 1 minute default
      maxRequests = 5,
      message = `Too many requests, please try again later`,
      keyGenerator = (req) => req.ip || req.connection.remoteAddress,
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
    } = options;

    return async (req, res, next) => {
      try {
        const key = keyGenerator(req);
        const now = Date.now();

        // Get or create record for this identifier
        let record = this.requests.get(key);

        // Initialize or reset if window expired
        if (!record || now > record.resetTime) {
          record = {
            count: 0,
            resetTime: now + windowMs,
            lastRequestTime: now,
          };
          this.requests.set(key, record);
        }

        // Check if limit exceeded
        if (record.count >= maxRequests) {
          const waitTime = Math.ceil((record.resetTime - now) / 1000);
          throw new RateLimitError(
            message || `Please wait ${waitTime} seconds before trying again`
          );
        }

        // Increment request count
        record.count++;
        record.lastRequestTime = now;

        // Add rate limit info to response headers
        res.setHeader("X-RateLimit-Limit", maxRequests);
        res.setHeader("X-RateLimit-Remaining", maxRequests - record.count);
        res.setHeader(
          "X-RateLimit-Reset",
          new Date(record.resetTime).toISOString()
        );

        // Handle skip options
        if (skipSuccessfulRequests || skipFailedRequests) {
          const originalSend = res.send;
          res.send = function (data) {
            const statusCode = res.statusCode;

            if (
              (skipSuccessfulRequests && statusCode < 400) ||
              (skipFailedRequests && statusCode >= 400)
            ) {
              record.count--;
            }

            return originalSend.call(this, data);
          };
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Create a custom rate limiter for specific use cases
   * @param {Function} checkFunction - Custom check function that returns { allowed, waitTime, error }
   * @param {Function} keyGenerator - Function to generate unique key
   */
  createCustomLimiter(checkFunction, keyGenerator = (req) => req.ip) {
    return async (req, res, next) => {
      try {
        const key = keyGenerator(req);
        const result = await checkFunction(key, req);

        if (!result.allowed) {
          const message = result.error || "Rate limit exceeded";
          throw new RateLimitError(message);
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  // Reset rate limit for a specific key
  reset(key) {
    this.requests.delete(key);
  }

  // Clear all rate limits
  clearAll() {
    this.requests.clear();
  }
}

// Create singleton instance
const rateLimiter = new RateLimiter();

// ==================== PRESET LIMITERS ====================

// General API limiter - 100 requests per 15 minutes
export const apiLimiter = rateLimiter.createLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
  message: "Too many requests from this IP, please try again later",
});

// Strict limiter for sensitive operations - 5 requests per hour
export const strictLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  message: "Too many attempts, please try again later",
});

// Auth limiter - 5 login attempts per 15 minutes
export const authLimiter = rateLimiter.createLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: "Too many login attempts, please try again later",
  keyGenerator: (req) => req.body.email || req.ip,
});

// OTP limiter - 3 requests per 5 minutes
export const otpLimiter = rateLimiter.createLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 3,
  message: "Too many OTP requests, please try again later",
  keyGenerator: (req) => req.body.email || req.ip,
});

// Password reset limiter - 3 requests per hour
export const passwordResetLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
  message: "Too many password reset attempts, please try again later",
  keyGenerator: (req) => req.body.email || req.ip,
});

// Export the rate limiter instance for custom use
export default rateLimiter;
