import jwt from "jsonwebtoken";
import redis from "../config/redis.js";

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

  const storedToken = await redis.get(`access_token:${decoded.id}`);
  if (!storedToken || storedToken !== token) {
    return res.status(401).json({ message: "Token revoked" });
  }

  req.user = decoded;
  next();
};
