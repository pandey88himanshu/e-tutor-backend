import { Router } from "express";
import {
    sendInterviewLink,
    vapiWebhook,
    getTranscript,
} from "../controllers/interview.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const router = Router();

/**
 * POST /api/interview/send-interview-link
 * Send interview invitation email with VAPI interview link.
 * Protected: Only admins can send interview links.
 */
router.post("/send-interview-link", authenticate, authorize("ADMIN"), sendInterviewLink);

/**
 * POST /api/interview/vapi-webhook
 * Webhook endpoint for VAPI to send call events (transcript, end-of-call, etc.)
 * Public: VAPI needs to call this without auth.
 */
router.post("/vapi-webhook", vapiWebhook);

/**
 * GET /api/interview/transcript/:applicationId
 * Fetch the transcript for a specific application.
 * Protected: Only admins can view transcripts.
 */
router.get("/transcript/:applicationId", authenticate, authorize("ADMIN"), getTranscript);

export default router;
