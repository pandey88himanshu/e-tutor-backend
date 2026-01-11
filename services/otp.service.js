import crypto from "crypto";
import redis from "../config/redis.js";

export class OTPService {
  constructor() {
    this.OTP_EXPIRY = 600; // 10 minutes
    this.OTP_PREFIX = "otp:";
    this.PENDING_USER_PREFIX = "pending_user:";
    this.RESEND_LIMIT = 3;
    this.RESEND_COOLDOWN = 30; // seconds
  }

  generateOTP() {
    // ✅ FIX 1: Always return as string
    return crypto.randomInt(1000, 9999).toString();
  }

  async storeOTP(email, otp, userData) {
    const otpKey = `${this.OTP_PREFIX}${email}`;
    const userKey = `${this.PENDING_USER_PREFIX}${email}`;

    // ✅ FIX 2: Ensure OTP is stored as string
    await redis.setex(otpKey, this.OTP_EXPIRY, String(otp));

    // ✅ FIX 3: Always stringify userData
    await redis.setex(
      userKey,
      this.OTP_EXPIRY,
      JSON.stringify({
        ...userData,
        resendCount: 0,
        lastResendAt: Date.now(),
      })
    );

    console.log("📝 Stored OTP:", {
      email,
      otp: String(otp),
      otpType: typeof String(otp),
    });
  }

  async verifyOTP(email, otp) {
    const otpKey = `${this.OTP_PREFIX}${email}`;
    const storedOTP = await redis.get(otpKey);

    console.log("🔍 OTP Verification Debug:", {
      email,
      inputOTP: otp,
      inputType: typeof otp,
      storedOTP: storedOTP,
      storedType: typeof storedOTP,
      match: String(storedOTP).trim() === String(otp).trim(),
    });

    if (!storedOTP) {
      return { isValid: false, error: "OTP expired or not found" };
    }

    // ✅ FIX 4: Convert both to strings and trim whitespace
    if (String(storedOTP).trim() !== String(otp).trim()) {
      console.error("❌ OTP Mismatch:", {
        stored: String(storedOTP).trim(),
        input: String(otp).trim(),
      });
      return { isValid: false, error: "Invalid OTP" };
    }

    console.log("✅ OTP Verified Successfully");
    return { isValid: true };
  }

  async getPendingUser(email) {
    const userKey = `${this.PENDING_USER_PREFIX}${email}`;

    console.log("🔍 Getting pending user for:", email);

    const rawData = await redis.get(userKey);

    console.log("🔍 Raw data from Redis:", {
      rawData,
      type: typeof rawData,
      isNull: rawData === null,
    });

    if (!rawData) {
      console.log("❌ No pending user data found");
      return null;
    }

    try {
      // ✅ FIX 5: Handle both string and object responses
      if (typeof rawData === "object" && rawData !== null) {
        console.log("✅ Pending user data (already object):", rawData);
        return rawData;
      }

      const parsed = JSON.parse(rawData);
      console.log("✅ Pending user data (parsed):", parsed);
      return parsed;
    } catch (error) {
      console.error("❌ Invalid pending user data in Redis:", rawData, error);
      return null;
    }
  }

  async canResendOTP(email) {
    console.log("🔍 Checking if can resend OTP for:", email);

    const userData = await this.getPendingUser(email);

    if (!userData) {
      return { allowed: false, error: "No pending signup found" };
    }

    if (userData.resendCount >= this.RESEND_LIMIT) {
      console.log("❌ Maximum resend attempts reached");
      return {
        allowed: false,
        error: "Maximum resend attempts reached",
      };
    }

    const timeSinceLastResend = Date.now() - userData.lastResendAt;

    if (timeSinceLastResend < this.RESEND_COOLDOWN * 1000) {
      const waitTime = Math.ceil(
        (this.RESEND_COOLDOWN * 1000 - timeSinceLastResend) / 1000
      );
      console.log(`❌ Need to wait ${waitTime} seconds`);
      return {
        allowed: false,
        error: `Please wait ${waitTime} seconds before resending`,
      };
    }

    console.log("✅ Can resend OTP");
    return { allowed: true };
  }

  async incrementResendCount(email) {
    console.log("🔍 Incrementing resend count for:", email);

    const userKey = `${this.PENDING_USER_PREFIX}${email}`;
    const userData = await this.getPendingUser(email);

    if (!userData) {
      console.log("❌ No user data found to increment");
      return;
    }

    const ttl = await redis.ttl(userKey);

    if (ttl <= 0) {
      console.log("❌ TTL expired");
      return;
    }

    const updatedUser = {
      ...userData,
      resendCount: userData.resendCount + 1,
      lastResendAt: Date.now(),
    };

    console.log("📝 Updated user data:", updatedUser);

    // ✅ FIX 6: ALWAYS stringify
    await redis.setex(userKey, ttl, JSON.stringify(updatedUser));

    console.log("✅ Resend count incremented");
  }

  async clearOTPData(email) {
    console.log("🔍 Clearing OTP data for:", email);

    await redis.del(`${this.OTP_PREFIX}${email}`);
    await redis.del(`${this.PENDING_USER_PREFIX}${email}`);

    console.log("✅ OTP data cleared");
  }

  async getOTPExpiry(email) {
    const ttl = await redis.ttl(`${this.OTP_PREFIX}${email}`);
    return ttl > 0 ? ttl : 0;
  }
}

export default new OTPService();
