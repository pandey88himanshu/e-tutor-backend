// services/authService.js
import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";

export class AuthService {
  async createUser(userData) {
    const {
      firstName,
      lastName,
      username,
      email,
      password,
      isInstructor,
      provider,
      googleId,
    } = userData;

    // ✅ FIX 6: Only hash password if it exists
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    return await prisma.user.create({
      data: {
        firstName,
        lastName,
        username,
        email,
        password: hashedPassword,
        isInstructor: Boolean(isInstructor),
        provider: provider || "local", // ✅ Default to 'local'
        googleId: googleId || null,
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        provider: true,
        googleId: true,
      },
    });
  }

  async findUserByEmailOrUsername(identifier) {
    return await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });
  }

  // ✅ FIX 7: Add method to find by Google ID
  async findUserByGoogleId(googleId) {
    return await prisma.user.findUnique({
      where: { googleId },
    });
  }

  async findUserById(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
    });
  }

  async verifyPassword(plainPassword, hashedPassword) {
    // ✅ FIX 8: Handle null password for OAuth users
    if (!hashedPassword) {
      return false;
    }
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  async updateRefreshToken(userId, refreshToken) {
    return await prisma.user.update({
      where: { id: userId },
      data: { refreshToken },
    });
  }

  async clearRefreshToken(userId) {
    return await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async checkUsernameExists(username) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return !!user;
  }

  generateTokens(user) {
    return {
      accessToken: generateAccessToken(user),
      refreshToken: generateRefreshToken(user),
    };
  }
}
