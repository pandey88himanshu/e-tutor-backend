import express from "express";
import {
  getAllApplications,
  getApplicationDetails,
  reviewApplication,
} from "../controllers/admin.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const router = express.Router();

// 🔒 GLOBAL SECURITY FOR THIS ROUTER
// 1. Must be logged in
router.use(authenticate);

// 2. Must be an ADMIN
router.use(authorize("ADMIN"));

// --- Endpoints ---

// Get list (e.g., ?status=PENDING)
router.get("/applications", getAllApplications);

// Get single application details
router.get("/applications/:id", getApplicationDetails);

// Approve or Reject
router.post("/applications/:id/review", reviewApplication);

export default router;
