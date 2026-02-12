import { VapiService } from "../services/vapi.service.js";
import { EmailService } from "../services/email.service.js";
import prisma from "../config/prisma.js";
import { AppError, ValidationError } from "../utils/errors.js";

const vapiService = new VapiService();
const emailService = new EmailService();

/**
 * POST /api/interview/send-interview-link
 *
 * Body: { email: string, applicantName?: string }
 *
 * 1. Creates/reuses a VAPI interview assistant
 * 2. Generates a web-call interview link
 * 3. Sends the link to the provided email
 */
export const sendInterviewLink = async (req, res, next) => {
    try {
        const { email, applicantName } = req.body;

        if (!email) {
            throw new ValidationError("Email is required");
        }

        // Check if the applicant has already completed the interview
        const user = await prisma.user.findUnique({
            where: { email },
            include: { instructorApplication: true },
        });

        if (user?.instructorApplication?.transcription) {
            return res.status(400).json({
                success: false,
                message: "This applicant has already completed the interview.",
            });
        }

        // 1. Generate the VAPI interview link
        console.log("📞 Generating VAPI interview link for:", email);
        const { assistantId, interviewLink } =
            await vapiService.generateInterviewLink();

        // 2. Send the interview link via email
        await emailService.sendInterviewLinkEmail(
            email,
            interviewLink,
            applicantName
        );

        // 3. Update the InstructorApplication with assistant ID if the user exists
        try {
            if (user?.instructorApplication) {
                await prisma.instructorApplication.update({
                    where: { id: user.instructorApplication.id },
                    data: {
                        vapiCallId: assistantId, // Store assistant ID for now; updated to real callId on webhook
                    },
                });
                console.log(
                    "📝 Updated application with assistant ID for user:",
                    email
                );
            }
        } catch (dbError) {
            // Non-critical — log but don't fail the request
            console.warn(
                "⚠️  Could not update application record:",
                dbError.message
            );
        }

        res.status(200).json({
            success: true,
            message: "Interview link sent successfully",
            data: {
                email,
                interviewLink,
                assistantId,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/interview/vapi-webhook
 *
 * Webhook endpoint that VAPI calls when events occur (e.g., call ended).
 * This stores the transcript in the database.
 *
 * VAPI sends events like:
 * - "end-of-call-report" (contains transcript, summary, etc.)
 * - "status-update"
 * - "transcript"
 */
export const vapiWebhook = async (req, res, next) => {
    try {
        const payload = req.body;

        console.log("🔔 VAPI Webhook received:", payload.message?.type || "unknown");
        console.log("📦 Full payload keys:", JSON.stringify(Object.keys(payload)));

        // Handle the end-of-call-report event
        // VAPI payload structure (from docs):
        // {
        //   "message": {
        //     "type": "end-of-call-report",
        //     "endedReason": "hangup",
        //     "call": { "id": "...", "assistantId": "...", ... },
        //     "artifact": {
        //       "transcript": "AI: How can I help? User: ...",
        //       "messages": [
        //         { "role": "assistant", "message": "How can I help?" },
        //         { "role": "user", "message": "..." }
        //       ]
        //     }
        //   }
        // }
        if (payload.message?.type === "end-of-call-report") {
            const callData = payload.message;
            const callId = callData.call?.id;
            const assistantId = callData.call?.assistantId;
            const endedReason = callData.endedReason;

            // Transcript is inside artifact
            const artifact = callData.artifact || {};
            const transcript = artifact.transcript || "";
            const messages = artifact.messages || [];

            console.log("📝 End-of-call report received:");
            console.log("   Call ID:", callId);
            console.log("   Assistant ID:", assistantId);
            console.log("   Ended reason:", endedReason);
            console.log("   Transcript length:", transcript.length);
            console.log("   Messages count:", messages.length);

            // Build a formatted transcript from messages if the plain transcript is empty
            let finalTranscript = transcript;
            if (!finalTranscript && messages.length > 0) {
                finalTranscript = messages
                    .map(
                        (msg) =>
                            `${msg.role === "assistant" ? "Interviewer" : "Candidate"}: ${msg.message || msg.content || ""}`
                    )
                    .join("\n");
            }

            if (callId || assistantId) {
                // Find the application linked to this call/assistant and store the transcript
                try {
                    const application =
                        await prisma.instructorApplication.findFirst({
                            where: {
                                OR: [
                                    ...(callId ? [{ vapiCallId: callId }] : []),
                                    ...(assistantId ? [{ vapiCallId: assistantId }] : []),
                                ],
                            },
                        });

                    if (application) {
                        await prisma.instructorApplication.update({
                            where: { id: application.id },
                            data: {
                                vapiCallId: callId || application.vapiCallId,
                                transcription: finalTranscript,
                            },
                        });
                        console.log(
                            "✅ Transcript stored for application:",
                            application.id
                        );
                    } else {
                        console.warn(
                            "⚠️  No matching application found for call:",
                            callId,
                            "/ assistant:",
                            assistantId
                        );
                        // Log the transcript anyway so it's not lost
                        console.log("📄 Unmatched transcript:", finalTranscript.substring(0, 500));
                    }
                } catch (dbError) {
                    console.error(
                        "❌ Error storing transcript:",
                        dbError.message
                    );
                }
            }
        }

        // Always respond 200 to acknowledge the webhook
        res.status(200).json({ success: true, message: "Webhook received" });
    } catch (error) {
        console.error("❌ Webhook processing error:", error);
        // Still return 200 to prevent VAPI from retrying
        res.status(200).json({ success: true, message: "Webhook received with errors" });
    }
};

/**
 * GET /api/interview/transcript/:applicationId
 *
 * Fetch the stored transcript for a given application.
 */
export const getTranscript = async (req, res, next) => {
    try {
        const { applicationId } = req.params;

        const application = await prisma.instructorApplication.findUnique({
            where: { id: applicationId },
            select: {
                id: true,
                vapiCallId: true,
                transcription: true,
                userId: true,
                user: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
            },
        });

        if (!application) {
            throw new AppError("Application not found", 404);
        }

        // If no transcript stored yet but we have a callId, try to fetch from VAPI
        if (!application.transcription && application.vapiCallId) {
            try {
                const callData = await vapiService.getCallDetails(
                    application.vapiCallId
                );
                const transcript = vapiService.extractTranscript(callData);

                if (transcript) {
                    await prisma.instructorApplication.update({
                        where: { id: applicationId },
                        data: { transcription: transcript },
                    });
                    application.transcription = transcript;
                }
            } catch (fetchError) {
                console.warn(
                    "⚠️  Could not fetch transcript from VAPI:",
                    fetchError.message
                );
            }
        }

        res.status(200).json({
            success: true,
            data: {
                applicationId: application.id,
                callId: application.vapiCallId,
                transcript: application.transcription,
                applicant: application.user,
            },
        });
    } catch (error) {
        next(error);
    }
};
