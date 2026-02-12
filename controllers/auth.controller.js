import { AuthService } from "../services/auth.services.js";
import { EmailService } from "../services/email.service.js";
import { OTPService } from "../services/otp.service.js";
import { TokenService } from "../services/token.service.js";
import { ValidationService } from "../services/validation.service.js";
import {
  ValidationError,
  AuthenticationError,
  ConflictError,
  RateLimitError,
} from "../utils/errors.js";

const authService = new AuthService();
const tokenService = new TokenService();
const validationService = new ValidationService();
const otpService = new OTPService();
const emailService = new EmailService();

/* SIGN UP - Send OTP */
export const signup = async (req, res, next) => {
  try {
    const validation = validationService.validateSignupData(req.body);
    if (!validation.isValid) {
      throw new ValidationError("Validation failed", validation.errors);
    }

    const { email, username, adminSecret } = req.body; // Extract adminSecret here

    const existingUser = await authService.findUserByEmailOrUsername(email);
    const existingUsername = await authService.findUserByEmailOrUsername(
      username
    );

    if (existingUser || existingUsername) {
      throw new ConflictError(
        "User with this email or username already exists"
      );
    }

    const otp = otpService.generateOTP();

    // Store ALL signup data (including adminSecret) in Redis/Temp
    await otpService.storeOTP(email, otp, {
      ...req.body,
      username: username.trim(),
      // Ensure adminSecret is passed so we can check it in verifyOTP
      adminSecret: adminSecret || null,
    });

    await emailService.sendOTPEmail(email, otp, username);

    res.status(200).json({
      message: "OTP sent successfully to your email",
      email,
      expiresIn: 600,
    });
  } catch (error) {
    next(error);
  }
};

/* VERIFY OTP & CREATE USER */
export const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      throw new ValidationError("Email and OTP are required");
    }

    const verification = await otpService.verifyOTP(email, otp);
    if (!verification.isValid) {
      throw new AuthenticationError(verification.error);
    }

    // Get pending user data
    const pendingUserData = await otpService.getPendingUser(email);
    if (!pendingUserData) {
      throw new ValidationError("No pending signup found");
    }

    // Validation
    if (
      !pendingUserData.username ||
      typeof pendingUserData.username !== "string" ||
      !pendingUserData.username.trim()
    ) {
      throw new ValidationError("Username is missing or invalid");
    }

    // --- 🚨 LOGIC FIX: Determine Role ---
    let userRole = "USER";
    if (pendingUserData.adminSecret === process.env.ADMIN_CREATION_KEY) {
      userRole = "ADMIN";
    }

    // Create User
    const newUser = await authService.createUser({
      firstName: pendingUserData.firstName,
      lastName: pendingUserData.lastName,
      username: pendingUserData.username.trim(),
      email: pendingUserData.email,
      password: pendingUserData.password || null,

      // ✅ FIX: Use 'role' Enum, not isInstructor
      role: userRole,

      provider: pendingUserData.provider || "local",
      googleId: pendingUserData.googleId || null,
    });

    // Generate tokens
    const { accessToken, refreshToken } = authService.generateTokens(newUser);

    // Store tokens
    await authService.updateRefreshToken(newUser.id, refreshToken);
    await tokenService.storeAccessToken(newUser.id, accessToken);

    // Set cookie
    res.cookie(
      "refreshToken",
      refreshToken,
      tokenService.createCookieOptions()
    );

    // Clean up OTP data
    await otpService.clearOTPData(email);

    res.status(201).json({
      message: "Signup successful",
      accessToken,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role, // Return role to frontend
      },
    });
  } catch (error) {
    console.error("💥 Verify OTP Error:", error);
    next(error);
  }
};

/* RESEND OTP */
export const resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ValidationError("Email is required");
    }

    const canResend = await otpService.canResendOTP(email);
    if (!canResend.allowed) {
      if (
        canResend.error.includes("wait") ||
        canResend.error.includes("seconds")
      ) {
        throw new RateLimitError(canResend.error);
      }
      throw new ValidationError(canResend.error);
    }

    const pendingUserData = await otpService.getPendingUser(email);
    if (!pendingUserData) {
      throw new ValidationError("No pending signup found");
    }

    const otp = otpService.generateOTP();
    await otpService.storeOTP(email, otp, pendingUserData);
    await otpService.incrementResendCount(email);
    await emailService.sendOTPEmail(email, otp, pendingUserData.username);

    const expiresIn = await otpService.getOTPExpiry(email);

    res.status(200).json({
      message: "OTP resent successfully",
      email,
      expiresIn,
    });
  } catch (error) {
    next(error);
  }
};

/* SIGN IN */
export const signin = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    const user = await authService.findUserByEmailOrUsername(identifier);
    if (!user) {
      throw new AuthenticationError("Invalid credentials");
    }

    if (user.provider === "google" && !user.password) {
      throw new AuthenticationError(
        "This account uses Google Sign-In. Please login with Google."
      );
    }

    const isValidPassword = await authService.verifyPassword(
      password,
      user.password
    );

    if (!isValidPassword) {
      throw new AuthenticationError("Invalid credentials");
    }

    const { accessToken, refreshToken } = authService.generateTokens(user);

    await authService.updateRefreshToken(user.id, refreshToken);
    await tokenService.storeAccessToken(user.id, accessToken);

    res.cookie(
      "refreshToken",
      refreshToken,
      tokenService.createCookieOptions()
    );

    res.json({
      message: "Login successful",
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role, // Return role
      },
    });
  } catch (error) {
    next(error);
  }
};

/* REFRESH TOKEN */
export const refreshToken = async (req, res, next) => {
  try {
    // Debug logging for cookie issues
    console.log("🔄 Refresh token request received");
    console.log("🍪 Cookies received:", JSON.stringify(req.cookies));
    console.log("📋 Request headers origin:", req.headers.origin);

    const oldRefreshToken = req.cookies.refreshToken;

    if (!oldRefreshToken) {
      console.log("❌ No refresh token in cookies");
      throw new AuthenticationError("Refresh token not provided");
    }

    const decoded = tokenService.verifyRefreshToken(oldRefreshToken);
    const user = await authService.findUserById(decoded.id);

    if (!user || user.refreshToken !== oldRefreshToken) {
      throw new AuthenticationError("Invalid refresh token");
    }

    // Rotate tokens
    const accessToken = tokenService.generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role, // Include role in new token
    });

    const newRefreshToken = tokenService.generateRefreshToken({
      id: user.id,
    });

    await authService.updateRefreshToken(user.id, newRefreshToken);
    await tokenService.storeAccessToken(user.id, accessToken); // ✅ FIX: Store new access token in Redis

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: isProduction, // Required when sameSite is "none"
      sameSite: isProduction ? "none" : "lax", // "none" for cross-origin in production
      path: "/", // Cookie accessible on all routes
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({ accessToken });
  } catch (error) {
    next(error);
  }
};

/* LOGOUT */
export const logout = async (req, res, next) => {
  try {
    const userId = req.user?.id; // Safe access
    if (userId) {
      await tokenService.deleteAccessToken(userId);
      await authService.clearRefreshToken(userId);
    }
    const isProduction = process.env.NODE_ENV === "production";
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/", // Must match the path used when setting
    });
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
};

/* GET CURRENT USER (ME) */
export const getMe = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError("User not authenticated");
    }

    // Get complete user with all relations
    const user = await authService.findUserByIdWithRelations(userId);

    if (!user) {
      throw new AuthenticationError("User not found");
    }

    // Return complete user data with relations (sensitive fields already excluded in select)
    res.json({ user });
  } catch (error) {
    next(error);
  }
};

/* CHECK USERNAME */
export const checkUsername = async (req, res, next) => {
  try {
    const { username } = req.query;
    if (!username?.trim()) {
      throw new ValidationError("Username is required");
    }
    const exists = await authService.checkUsernameExists(username);
    res.status(200).json({ exists });
  } catch (error) {
    next(error);
  }
};

/* GOOGLE OAUTH CALLBACK */
export const googleCallback = async (req, res) => {
  try {
    const { dbUser, profile } = req.user;
    const email = profile.emails?.[0]?.value;

    if (!email) {
      throw new AuthenticationError("Google account has no email");
    }

    // ── CASE A: EXISTING USER ──
    if (dbUser) {
      if (!dbUser.googleId) {
        // ✅ FIX: Use service instead of direct prisma call
        await authService.updateUser(dbUser.id, {
          googleId: profile.id,
          provider: "google",
        });
      }

      const { accessToken, refreshToken } = authService.generateTokens(dbUser);
      await authService.updateRefreshToken(dbUser.id, refreshToken);
      await tokenService.storeAccessToken(dbUser.id, accessToken);

      res.cookie(
        "refreshToken",
        refreshToken,
        tokenService.createCookieOptions()
      );

      return res.redirect(
        `${process.env.FRONTEND_URL}/oauth-success?token=${accessToken}`
      );
    }

    // ── CASE B: NEW USER ──
    const baseUsername = email.split("@")[0];
    const username = await generateUniqueUsername(baseUsername);

    const newUser = await authService.createUser({
      email,
      firstName: profile.name?.givenName || "User",
      lastName: profile.name?.familyName || "",
      username,
      password: null,
      provider: "google",
      googleId: profile.id,

      // ✅ FIX: Default Google users to USER (Student)
      role: "USER",
    });

    const { accessToken, refreshToken } = authService.generateTokens(newUser);
    await authService.updateRefreshToken(newUser.id, refreshToken);
    await tokenService.storeAccessToken(newUser.id, accessToken);

    res.cookie(
      "refreshToken",
      refreshToken,
      tokenService.createCookieOptions()
    );

    return res.redirect(
      `${process.env.FRONTEND_URL}/oauth-success?token=${accessToken}`
    );
  } catch (err) {
    console.error("❌ Google Callback Error:", err);
    return res.redirect(
      `${process.env.FRONTEND_URL}/login?error=google_auth_failed`
    );
  }
};

// Helper function
async function generateUniqueUsername(baseUsername) {
  // Need to use the authService instance
  const authService = new AuthService();
  let username = baseUsername;
  let counter = 1;

  while (await authService.checkUsernameExists(username)) {
    username = `${baseUsername}${counter}`;
    counter++;
  }
  return username;
}
