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
    await otpService.storeOTP(email, otp, req.body);
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

    // ✅ Create user (works for both Google & Email signup)
    const newUser = await authService.createUser({
      firstName: pendingUserData.firstName,
      lastName: pendingUserData.lastName,
      username: pendingUserData.username,
      email: pendingUserData.email,
      password: pendingUserData.password || null, // 👈 Google users have no password
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
    const validation = validationService.validateSigninData(req.body);
    if (!validation.isValid) {
      throw new ValidationError("Validation failed", validation.errors);
    }

    const { identifier, password } = req.body;

    const user = await authService.findUserByEmailOrUsername(identifier);
    if (!user) {
      throw new AuthenticationError("Invalid credentials");
    }

    // ✅ FIX 9: Check if user is OAuth user
    if (user.provider === "google" && !user.password) {
      throw new AuthenticationError(
        "This account uses Google Sign-In. Please login with Google."
      );
    }

    // Verify password
    const isValidPassword = await authService.verifyPassword(
      password,
      user.password
    );
    if (!isValidPassword) {
      throw new AuthenticationError("Invalid credentials");
    }

    // Generate tokens
    const { accessToken, refreshToken } = authService.generateTokens(user);

    // Store tokens
    await authService.updateRefreshToken(user.id, refreshToken);
    await tokenService.storeAccessToken(user.id, accessToken);

    // Set cookie
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
        username: user.username,
        email: user.email,
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
/* oauth google */
export const googleCallback = async (req, res, next) => {
  try {
    const { user, googleProfile } = req.user;
    const email = googleProfile.emails[0].value;

    // 🔹 CASE 1: User already exists → LOGIN
    if (user) {
      // ✅ FIX 2: If user exists but doesn't have googleId, update it
      if (!user.googleId) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: googleProfile.id,
            provider: "google",
          },
        });
      }

      const { accessToken, refreshToken } = authService.generateTokens(user);

      await authService.updateRefreshToken(user.id, refreshToken);
      await tokenService.storeAccessToken(user.id, accessToken);

      res.cookie(
        "refreshToken",
        refreshToken,
        tokenService.createCookieOptions()
      );

      return res.redirect(
        `${process.env.FRONTEND_URL}/oauth-success?token=${accessToken}`
      );
    }

    // 🔹 CASE 2: New Google user → SEND OTP
    const otp = otpService.generateOTP();

    // ✅ FIX 3: Generate unique username
    const baseUsername = email.split("@")[0];
    const uniqueUsername = await generateUniqueUsername(baseUsername);

    const pendingUser = {
      email,
      firstName: googleProfile.name.givenName,
      lastName: googleProfile.name.familyName || "",
      username: uniqueUsername,
      provider: "google",
      googleId: googleProfile.id,
      password: null, // ✅ Explicitly set null for OAuth users
    };

    await otpService.storeOTP(email, otp, pendingUser);
    await emailService.sendOTPEmail(email, otp, pendingUser.username);

    // ✅ FIX 4: Pass username to frontend for display
    return res.redirect(
      `${process.env.FRONTEND_URL}/verify-otp?email=${encodeURIComponent(
        email
      )}&username=${encodeURIComponent(uniqueUsername)}&provider=google`
    );
  } catch (err) {
    console.error("❌ Google OAuth Error:", err);
    return res.redirect(
      `${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(
        "Authentication failed"
      )}`
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
