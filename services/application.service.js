import prisma from "../config/prisma.js";
import { ConflictError } from "../utils/errors.js";

export class ApplicationService {
  async createApplication(userId, data) {
    // 1. Check if user already has an application
    const existingApp = await prisma.instructorApplication.findUnique({
      where: { userId },
    });

    if (existingApp) {
      if (existingApp.status === "PENDING") {
        throw new ConflictError("You already have a pending application.");
      }
      if (existingApp.status === "APPROVED") {
        throw new ConflictError("You are already an instructor!");
      }
      // If REJECTED, we allow re-submission
    }

    // 2. Upsert (Create new OR Update existing if rejected)
    return await prisma.instructorApplication.upsert({
      where: { userId },

      // Case A: Create New
      create: {
        userId,
        ...data,
        status: "PENDING",
        // Removed interviewStatus
      },

      // Case B: Update Rejected
      update: {
        ...data,
        status: "PENDING",

        // Reset AI fields
        aiScore: null,
        aiFeedback: null,
        transcription: null,

        // Removed interviewStatus and adminNote to match your schema
      },
    });
  }
}
