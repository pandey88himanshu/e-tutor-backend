import { ApplicationService } from "../services/application.service.js";
import { ValidationService } from "../services/validation.service.js";
import { ValidationError } from "../utils/errors.js";

const applicationService = new ApplicationService();
const validationService = new ValidationService();

export const createApplication = async (req, res, next) => {
  try {
    // 1. Validate Input
    const validation = validationService.validateInstructorApplication(
      req.body
    );
    if (!validation.isValid) {
      throw new ValidationError("Validation failed", validation.errors);
    }

    // 2. Call Service (req.user.id comes from 'authenticate' middleware)
    const application = await applicationService.createApplication(
      req.user.id,
      req.body
    );

    res.status(201).json({
      status: "success",
      message: "Application submitted successfully",
      data: application,
    });
  } catch (error) {
    next(error);
  }
};
