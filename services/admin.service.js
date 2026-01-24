import prisma from "../config/prisma.js";
import { ValidationError } from "../utils/errors.js";

export class AdminService {
  /**
   * Get all applications. Optionally filter by status.
   */
  async getApplications(status) {
    const where = status ? { status } : {};

    return await prisma.instructorApplication.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get details of a single application (including AI Interview Data)
   */
  async getApplicationById(id) {
    const application = await prisma.instructorApplication.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            // Add any other user fields you want to see
          },
        },
      },
    });

    if (!application) throw new ValidationError("Application not found");
    return application;
  }

  /**
   * Review Application (Approve/Reject)
   * Uses a TRANSACTION to ensure data integrity.
   */
  async reviewApplication(applicationId, decision, adminNote) {
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      throw new ValidationError("Decision must be APPROVED or REJECTED");
    }

    const application = await prisma.instructorApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) throw new ValidationError("Application not found");

    // ⚡ TRANSACTION START
    return await prisma.$transaction(async (tx) => {
      // 1. Update Application Status
      const updatedApp = await tx.instructorApplication.update({
        where: { id: applicationId },
        data: {
          status: decision,
          adminNote: adminNote || null,
        },
      });

      // 2. IF APPROVED: Upgrade User Role to INSTRUCTOR
      if (decision === "APPROVED") {
        await tx.user.update({
          where: { id: application.userId },
          data: { role: "INSTRUCTOR" },
        });
      }

      // (If REJECTED, User remains "USER" and can re-apply later)

      return updatedApp;
    });
    // ⚡ TRANSACTION END
  }
  async deleteApplication(id) {
    // First check if the application exists
    const existingApplication = await prisma.instructorApplication.findUnique({
      where: { id },
    });

    if (!existingApplication) {
      throw new ValidationError("Application not found");
    }

    // Now delete the application
    const deletedApplication = await prisma.instructorApplication.delete({
      where: { id },
    });

    return deletedApplication;
  }
}


