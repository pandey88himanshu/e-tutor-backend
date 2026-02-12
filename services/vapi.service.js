const VAPI_BASE_URL = "https://api.vapi.ai";

/**
 * VAPI Service
 * Handles creating assistants, generating web-call links,
 * and fetching call transcripts from the VAPI platform.
 */
export class VapiService {
    constructor() {
        this.privateKey = process.env.VAPI_PRIVATE_KEY;
        this.publicKey = process.env.VAPI_PUBLIC_KEY;
        this.backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;

        if (!this.privateKey || !this.publicKey) {
            console.warn("⚠️  VAPI keys not found in environment variables!");
        }
    }

    /**
     * Helper: make authenticated requests to VAPI API
     */
    async _request(endpoint, method = "GET", body = null) {
        const options = {
            method,
            headers: {
                Authorization: `Bearer ${this.privateKey}`,
                "Content-Type": "application/json",
            },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${VAPI_BASE_URL}${endpoint}`, options);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `VAPI API error (${response.status}): ${errorText}`
            );
        }

        return response.json();
    }

    /**
     * Create a VAPI assistant configured for a short psychological interview.
     * - 3 basic psychological questions
     * - One-word / one-line answers expected
     * - ~1 minute duration
     *
     * Returns the created assistant object (includes assistant.id).
     */
    async createInterviewAssistant() {
        const webhookUrl = `${this.backendUrl}/api/interview/vapi-webhook`;
        console.log("🔗 Setting VAPI webhook URL to:", webhookUrl);

        const assistantPayload = {
            name: "E-Tutor Psychological Interviewer",
            firstMessage:
                "Hello! Welcome to the E-Tutor instructor screening interview. I will ask you 3 quick psychological questions. Please answer each one briefly — a single word or one short sentence is perfect. Let's begin!",
            model: {
                provider: "openai",
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: `You are a professional psychological interviewer for an online education platform called E-Tutor. 
Your job is to conduct a very short screening interview with exactly 3 questions.

RULES:
1. Ask exactly these 3 questions, one at a time. Wait for the candidate's answer before moving to the next question.
2. After the candidate answers each question, acknowledge briefly and move to the next.
3. After all 3 questions are answered, thank the candidate and end the call using the endCall function. Do NOT wait for the candidate to hang up.
4. Keep the entire call under 1 minute.

THE 3 QUESTIONS:
Q1: "How do you typically handle stress or pressure in a teaching environment?"
Q2: "What motivates you the most when working with students?"
Q3: "How would you describe your communication style in one word?"

After the third answer, say: "Thank you for your responses! That completes your screening interview. Have a great day!" and then immediately end the call using the endCall function.`,
                    },
                ],
            },
            voice: {
                provider: "11labs",
                voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel voice
            },
            // Server URL — VAPI will POST webhook events (end-of-call-report, transcript, etc.) here
            server: {
                url: webhookUrl,
            },
            // ✅ Allow the AI to end the call automatically after finishing questions
            endCallFunctionEnabled: true,
            maxDurationSeconds: 120, // 2 min max safety limit
            endCallMessage:
                "Thank you for completing the interview. Goodbye!",
        };

        const assistant = await this._request(
            "/assistant",
            "POST",
            assistantPayload
        );
        console.log("✅ VAPI Assistant created:", assistant.id);
        return assistant;
    }

    /**
     * Get or create the interview assistant.
     * Lists existing assistants and reuses one if it already exists.
     */
    async getOrCreateAssistant() {
        try {
            // List existing assistants and check if our interview assistant exists
            const assistants = await this._request("/assistant", "GET");

            const existing = assistants.find(
                (a) => a.name === "E-Tutor Psychological Interviewer"
            );

            if (existing) {
                console.log("♻️  Reusing existing VAPI assistant:", existing.id);

                // Ensure the server URL and endCallFunction are up-to-date
                const webhookUrl = `${this.backendUrl}/api/interview/vapi-webhook`;
                const needsUpdate =
                    !existing.server?.url ||
                    existing.server.url !== webhookUrl ||
                    !existing.endCallFunctionEnabled;

                if (needsUpdate) {
                    console.log("🔄 Updating assistant config (webhook URL + endCallFunction)");
                    await this._request(`/assistant/${existing.id}`, "PATCH", {
                        server: { url: webhookUrl },
                        endCallFunctionEnabled: true,
                    });
                }

                return existing;
            }

            // Create a new one if not found
            return await this.createInterviewAssistant();
        } catch (error) {
            console.error("Error getting/creating assistant:", error.message);
            throw error;
        }
    }

    /**
     * Generate a web call link for the interview.
     * The candidate opens this link in their browser to start the voice interview.
     *
     * Format: https://vapi.ai/call/<assistantId>?publicKey=<publicKey>
     */
    async generateInterviewLink() {
        const assistant = await this.getOrCreateAssistant();

        // Point to the frontend's custom interview page with VAPI Web SDK
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const interviewLink = `${frontendUrl}/interview?assistantId=${assistant.id}&publicKey=${this.publicKey}`;

        return {
            assistantId: assistant.id,
            interviewLink,
        };
    }

    /**
     * Fetch call details (including transcript) from VAPI by callId.
     */
    async getCallDetails(callId) {
        try {
            const call = await this._request(`/call/${callId}`, "GET");
            return call;
        } catch (error) {
            console.error("Error fetching call details:", error.message);
            throw error;
        }
    }

    /**
     * Extract a clean transcript string from the call's messages/artifact.
     */
    extractTranscript(callData) {
        // VAPI stores transcript in call.artifact.transcript or call.messages
        if (callData.artifact?.transcript) {
            return callData.artifact.transcript;
        }

        // Fallback: build transcript from messages array
        if (callData.messages && Array.isArray(callData.messages)) {
            return callData.messages
                .filter(
                    (msg) =>
                        msg.role === "assistant" ||
                        msg.role === "user"
                )
                .map(
                    (msg) =>
                        `${msg.role === "assistant" ? "Interviewer" : "Candidate"}: ${msg.content || msg.message || ""}`
                )
                .join("\n");
        }

        return null;
    }
}
