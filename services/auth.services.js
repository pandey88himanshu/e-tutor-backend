import bcrypt from "bcrypt";
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";
import prisma from "../config/prisma.js";

export class AuthService {
  async createUser(userData) {
    const {
      firstName,
      lastName,
      username,
      email,
      password,
      role, // ✅ CHANGED: Receive 'role' instead of 'isInstructor'
      provider,
      googleId,
    } = userData;

    // Only hash password if it exists (skip for Google Auth)
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    // ✅ FIX: Use 'role' enum. Default to "USER" if undefined.
    return await prisma.user.create({
      data: {
        firstName,
        lastName,
        username,
        email,
        password: hashedPassword,
        role: role || "USER", // Map to your Prisma Enum
        provider: provider || "local",
        googleId: googleId || null,
      },
      // Return these fields to the controller
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true, // ✅ Return role so frontend knows permissions
        provider: true,
        googleId: true,
      },
    });
  }

  // ✅ NEW: Required for your Google OAuth Controller
  async updateUser(userId, data) {
    return await prisma.user.update({
      where: { id: userId },
      data: data,
    });
  }

  async findUserByEmailOrUsername(identifier) {
    return await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });
  }

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

  // Get complete user with all relations
  async findUserByIdWithRelations(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        provider: true,
        bio: true,
        profileImage: true,
        createdAt: true,
        updatedAt: true,
        // Relations
        instructorApplication: true,
        createdCourses: true,
        purchases: {
          include: {
            course: true,
          },
        },
      },
    });
  }

  async verifyPassword(plainPassword, hashedPassword) {
    // Handle null password for OAuth users
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
