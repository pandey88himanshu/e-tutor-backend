import { Router } from "express";
import {
  signup,
  signin,
  refreshToken,
  logout,
  checkUsername,
  verifyOTP,
  resendOTP,
  googleCallback,
  getMe,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import passport from "passport";

const router = Router();

router.post("/sign-up", signup);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);
router.post("/sign-in", signin);
router.post("/refresh", refreshToken);
router.get("/check-username", checkUsername);
router.get("/me", authenticate, getMe);
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login`,
  }),
  googleCallback
);
router.post("/logout", authenticate, logout);

export default router;
