import express from "express";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import cookieParser from "cookie-parser";
import { errorHandler } from "./utils/errors.js";
import cors from "cors";
dotenv.config();

const app = express();
const PORT = process.env.PORT;
const corsOptions = {
  origin: "http://localhost:3000", // Specify exact frontend origin (no wildcard!)
  credentials: true, // Allow cookies/credentials
  // Optional: allowed methods/headers if needed
  // methods: ['GET', 'POST', 'PUT', 'DELETE'],
  // allowedHeaders: ['Content-Type', 'Authorization'],
};
// Middleware
app.use(express.json());
app.use(cors(corsOptions));
app.use(cookieParser());
// Routes
app.get("/", (req, res) => {
  res.send("Hello from Express Server");
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});
// Error handling middleware - MUST be last
app.use(errorHandler);
//custome routes
app.use("/api/auth", authRoutes);
// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
