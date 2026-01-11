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

    const { email, username } = req.body;

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
    await otpService.storeOTP(email, otp, {
      ...req.body,
      username: username.trim(),
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

export const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      throw new ValidationError("Email and OTP are required");
    }

    console.log("🔍 Verify OTP Request:", {
      email,
      otp,
      otpType: typeof otp,
      otpLength: otp.length,
    });

    const verification = await otpService.verifyOTP(email, otp);

    console.log("✅ Verification result:", verification);

    if (!verification.isValid) {
      console.error("❌ OTP Invalid:", verification.error);
      throw new AuthenticationError(verification.error);
    }

    // Get pending user data (email signup OR google signup)
    const pendingUserData = await otpService.getPendingUser(email);

    if (!pendingUserData) {
      throw new ValidationError("No pending signup found");
    }

    // 🚨 HARD VALIDATION (THIS WAS MISSING)
    if (
      !pendingUserData.username ||
      typeof pendingUserData.username !== "string" ||
      !pendingUserData.username.trim()
    ) {
      throw new ValidationError("Username is missing or invalid");
    }

    // ✅ Create user (works for both Google & Email signup)
    const newUser = await authService.createUser({
      firstName: pendingUserData.firstName,
      lastName: pendingUserData.lastName,
      username: pendingUserData.username.trim(), // ✅ FIX
      email: pendingUserData.email,
      password: pendingUserData.password || null,
      isInstructor: pendingUserData.isInstructor || false,
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

    // Send response
    res.status(201).json({
      message: "Signup successful",
      accessToken,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
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
      // Check if it's a rate limit/cooldown error
      if (
        canResend.error.includes("wait") ||
        canResend.error.includes("seconds")
      ) {
        throw new RateLimitError(canResend.error); // ← Using RateLimitError here
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

    if (!user.email || !user.username) {
      throw new AuthenticationError(
        "Account setup incomplete. Please login with Google."
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
      },
    });
  } catch (error) {
    next(error);
  }
};

/* REFRESH TOKEN */
export const refreshToken = async (req, res, next) => {
  try {
    const oldRefreshToken = req.cookies.refreshToken;

    if (!oldRefreshToken) {
      throw new AuthenticationError("Refresh token not provided");
    }

    const decoded = tokenService.verifyRefreshToken(oldRefreshToken);

    const user = await authService.findUserById(decoded.id);
    if (!user || user.refreshToken !== oldRefreshToken) {
      throw new AuthenticationError("Invalid refresh token");
    }

    // 🔁 Rotate tokens
    const accessToken = tokenService.generateAccessToken({
      id: user.id,
      email: user.email,
    });

    const newRefreshToken = tokenService.generateRefreshToken({
      id: user.id,
    });

    // Update refresh token in DB
    await authService.updateRefreshToken(user.id, newRefreshToken);

    // Set new refresh token cookie
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/auth/refresh",
    });

    return res.json({ accessToken });
  } catch (error) {
    next(error);
  }
};

/* LOGOUT */
export const logout = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Clear tokens
    await tokenService.deleteAccessToken(userId);
    await authService.clearRefreshToken(userId);

    // Clear cookie
    res.clearCookie("refreshToken");

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
};

/* CHECK USERNAME AVAILABILITY */
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

/* oauth google */
export const googleCallback = async (req, res, next) => {
  try {
    const { dbUser, profile } = req.user;

    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new AuthenticationError("Google account has no email");
    }

    // ───────────────────────── EXISTING USER ─────────────────────────
    if (dbUser) {
      if (!dbUser.googleId) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            googleId: profile.id,
            provider: "google",
          },
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

    // ───────────────────────── NEW USER (OTP FLOW) ─────────────────────────
    const otp = otpService.generateOTP();
    const baseUsername = email.split("@")[0];
    const username = await generateUniqueUsername(baseUsername);

    const pendingUser = {
      email,
      firstName: profile.name?.givenName || "User",
      lastName: profile.name?.familyName || "",
      username,
      provider: "google",
      googleId: profile.id,
      password: null,
    };

    await otpService.storeOTP(email, otp, pendingUser);
    await emailService.sendOTPEmail(email, otp, username);

    return res.redirect(
      `${process.env.FRONTEND_URL}/verify-otp?email=${encodeURIComponent(
        email
      )}&username=${encodeURIComponent(username)}&provider=google`
    );
  } catch (err) {
    console.error("❌ Google Callback Error:", err);
    return res.redirect(
      `${process.env.FRONTEND_URL}/login?error=google_auth_failed`
    );
  }
};

// ✅ FIX 5: Helper function to generate unique username
async function generateUniqueUsername(baseUsername) {
  let username = baseUsername;
  let counter = 1;

  while (await authService.checkUsernameExists(username)) {
    username = `${baseUsername}${counter}`;
    counter++;
  }

  return username;
}
