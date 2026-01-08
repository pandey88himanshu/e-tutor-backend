import { AuthService } from "../services/auth.services.js";
import { TokenService } from "../services/tokenService.js";
import { ValidationService } from "../services/validationService.js";
import {
  ValidationError,
  AuthenticationError,
  ConflictError,
} from "../utils/errors.js";

const authService = new AuthService();
const tokenService = new TokenService();
const validationService = new ValidationService();

/* SIGN UP */
export const signup = async (req, res, next) => {
  try {
    // Validate input
    const validation = validationService.validateSignupData(req.body);
    if (!validation.isValid) {
      throw new ValidationError("Validation failed", validation.errors);
    }

    // Check if user exists
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

    // Create user
    const user = await authService.createUser(req.body);

    res.status(201).json({
      message: "Signup successful",
      user,
    });
  } catch (error) {
    next(error);
  }
};

/* SIGN IN */
export const signin = async (req, res, next) => {
  try {
    // Validate input
    const validation = validationService.validateSigninData(req.body);
    if (!validation.isValid) {
      throw new ValidationError("Validation failed", validation.errors);
    }

    const { identifier, password } = req.body;

    // Find user
    const user = await authService.findUserByEmailOrUsername(identifier);
    if (!user) {
      throw new AuthenticationError("Invalid credentials");
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
    const token = req.cookies.refreshToken;

    if (!token) {
      throw new AuthenticationError("Refresh token not provided");
    }

    // Verify token
    let decoded;
    try {
      decoded = tokenService.verifyRefreshToken(token);
    } catch (error) {
      throw new AuthenticationError("Invalid refresh token");
    }

    // Find user and validate token
    const user = await authService.findUserById(decoded.id);
    if (!user || user.refreshToken !== token) {
      throw new AuthenticationError("Invalid refresh token");
    }

    // Generate new access token
    const newAccessToken = authService.generateTokens(user).accessToken;
    await tokenService.storeAccessToken(user.id, newAccessToken);

    res.json({ accessToken: newAccessToken });
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
