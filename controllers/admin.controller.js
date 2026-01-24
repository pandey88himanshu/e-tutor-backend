import { AdminService } from "../services/admin.service.js";

const adminService = new AdminService();

// GET /api/admin/applications?status=PENDING
export const getAllApplications = async (req, res, next) => {
  try {
    const { status } = req.query;
    const applications = await adminService.getApplications(status);

    res.status(200).json({
      status: "success",
      results: applications.length,
      data: applications,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/applications/:id
export const getApplicationDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const application = await adminService.getApplicationById(id);

    res.status(200).json({
      status: "success",
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/admin/applications/:id
export const deleteApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    console.log("🗑️ Delete request received for application ID:", id);

    const application = await adminService.deleteApplication(id);
    console.log("✅ Application deleted successfully:", application.id);

    res.status(200).json({
      status: "success",
      data: application,
    });
  } catch (error) {
    console.error("❌ Delete failed:", error.message);
    next(error);
  }
};

// POST /api/admin/applications/:id/review
export const reviewApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision, note } = req.body; // Expects { decision: "APPROVED", note: "..." }

    const result = await adminService.reviewApplication(id, decision, note);

    res.status(200).json({
      status: "success",
      message: `Application ${decision.toLowerCase()} successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
