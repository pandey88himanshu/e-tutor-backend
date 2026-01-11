import { Router } from "express";
import {
  signup,
  signin,
  refreshToken,
  logout,
  checkUsername,
  verifyOTP,
  resendOTP,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/sign-up", signup);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);
router.post("/sign-in", signin);
router.post("/refresh", refreshToken);
router.get("/check-username", checkUsername);
router.post("/logout", authenticate, logout);

export default router;
