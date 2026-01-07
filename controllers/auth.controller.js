import prisma from "../config/prisma.js";
import redis from "../config/redis.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";

const ACCESS_TOKEN_TTL = 60 * 15;

/* SIGN UP */
export const signup = async (req, res) => {
  const { firstName, lastName, username, email, password, isInstructor } =
    req.body;

  if (!firstName || !lastName || !username || !email || !password) {
    return res.status(400).json({ message: "All fields required" });
  }

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (exists) return res.status(409).json({ message: "User exists" });

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
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
    },
  });

  res.status(201).json({ message: "Signup successful", user });
};

/* SIGN IN */
export const signin = async (req, res) => {
  const { identifier, password } = req.body;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  await redis.set(`access_token:${user.id}`, accessToken, {
    ex: ACCESS_TOKEN_TTL,
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    message: "Login successful",
    accessToken,
  });
};

/* REFRESH TOKEN */
export const refreshToken = async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user || user.refreshToken !== token) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const newAccessToken = generateAccessToken(user);
  await redis.set(`access_token:${user.id}`, newAccessToken, {
    ex: ACCESS_TOKEN_TTL,
  });

  res.json({ accessToken: newAccessToken });
};

/* LOGOUT */
export const logout = async (req, res) => {
  await redis.del(`access_token:${req.user.id}`);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshToken: null },
  });

  res.clearCookie("refreshToken");
  res.json({ message: "Logged out" });
};

//get user name
export const checkUsername = async (req, res) => {
  try {
    const { username } = req.query;

    // 1. Validate input
    if (!username) {
      return res.status(400).json({
        message: "Username is required",
      });
    }

    // 2. Check username in DB
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    // 3. Response
    return res.status(200).json({
      exists: !!user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
