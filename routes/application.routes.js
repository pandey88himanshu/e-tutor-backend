import { Router } from "express";
import { createApplication } from "../controllers/application.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

// 🔒 Protected Route: User must be logged in to apply
// Endpoint: POST /api/instructor/apply
router.post("/apply", authenticate, createApplication);

// Future routes can go here (e.g., get my application status)
// router.get("/status", authenticate, getMyApplicationStatus);

export default router;
