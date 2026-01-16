import express from "express";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import cookieParser from "cookie-parser";
import { errorHandler } from "./utils/errors.js";
import cors from "cors";
import passport from "passport";
import "./config/passport.js";
import adminRoutes from "./routes/admin.routes.js";
import applicationRoutes from "./routes/application.routes.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT;
const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true,
};

// Middleware
app.use(express.json());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(passport.initialize());

// Routes
app.get("/", (req, res) => {
  res.send("Hello from Express Server");
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// Custom routes - MUST come before error handler
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/application", applicationRoutes);

// Error handling middleware - MUST be last (after all routes)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
