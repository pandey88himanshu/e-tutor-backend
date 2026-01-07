import express from "express";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(express.json());
app.use(cookieParser());
// Routes
app.get("/", (req, res) => {
  res.send("Hello from Express Server");
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

//custome routes
app.use("/api/auth", authRoutes);
// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
