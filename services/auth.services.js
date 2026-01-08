// services/authService.js
import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";

export class AuthService {
  async createUser(userData) {
    const { firstName, lastName, username, email, password, isInstructor } =
      userData;

    const hashedPassword = await bcrypt.hash(password, 10);

    return await prisma.user.create({
      data: {
        firstName,
        lastName,
        username,
        email,
        password: hashedPassword,
        isInstructor: Boolean(isInstructor),
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
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

  async findUserById(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
    });
  }

  async verifyPassword(plainPassword, hashedPassword) {
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
