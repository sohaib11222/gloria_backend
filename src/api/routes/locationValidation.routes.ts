import { Router } from "express";
import { requireAuth } from "../../infra/auth.js";
import { requireRole, requireCompanyType } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";
import { validateLocationPayload, validateLocationArray } from "../../services/locationValidation.js";

export const locationValidationRouter = Router();

/**
 * @openapi
 * /api/v1/location/validate:
 *   post:
 *     tags: [Location Validation]
 *     summary: Validate a single location JSON payload
 *     description: |
 *       Validates a location payload according to the specification:
 *       - UTF-8 encoding required
 *       - CompanyCode must match (if provided)
 *       - All required fields must be present and valid
 *       - Opening hours for all 7 days required
 *       
 *       **Access:**
 *       - ADMIN users: Can validate any location payload. CompanyCode validation is optional.
 *       - SOURCE companies: Can validate location payloads. CompanyCode must match their company code.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               CompanyCode:
 *                 type: string
 *               Branchcode:
 *                 type: string
 *               Name:
 *                 type: string
 *               LocationType:
 *                 type: string
 *               CollectionType:
 *                 type: string
 *               EmailAddress:
 *                 type: string
 *               Telephone:
 *                 type: object
 *               Address:
 *                 type: object
 *               Opening:
 *                 type: object
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Location data is valid"
 *       422:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 fields:
 *                   type: array
 *                   items:
 *                     type: string
 *                 days:
 *                   type: array
 *                   items:
 *                     type: string
 */
locationValidationRouter.post(
  "/api/v1/location/validate",
  requireAuth(),
  async (req: any, res, next) => {
    try {
      const userRole = req.user?.role;
      const userType = req.user?.type;
      
      // Allow ADMIN role or SOURCE company type
      if (userRole !== "ADMIN" && userType !== "SOURCE") {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "Only ADMIN users or SOURCE companies can validate locations",
        });
      }

      const payload = req.body;
      let companyCode: string | undefined = undefined;

      // For ADMIN users, CompanyCode validation is completely optional
      // Explicitly set companyCode to undefined to skip CompanyCode validation
      // Admin can validate any location payload regardless of CompanyCode value
      if (userRole === "ADMIN") {
        companyCode = undefined; // Explicitly skip CompanyCode validation for admins
      }
      // For SOURCE companies (and not ADMIN), get their companyCode for validation
      else if (userType === "SOURCE" && req.user?.companyId) {
        const company = await prisma.company.findUnique({
          where: { id: req.user.companyId },
          select: { companyCode: true, type: true },
        });

        if (!company || company.type !== "SOURCE") {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "Company not found or invalid type",
          });
        }

        companyCode = company.companyCode || undefined;
      }

      // Validate the payload
      // For admins, CompanyCode validation is optional (companyCode is undefined, so validation skips it)
      // For sources, CompanyCode must match their company code
      const result = validateLocationPayload(payload, companyCode);

      if (!result.valid) {
        // Return structured error response that matches frontend expectations
        return res.status(422).json({
          status: "error",
          message: result.error?.error || "Location validation failed",
          error: result.error?.error || "Location validation failed",
          fields: result.error?.fields || [],
          days: result.error?.days || [],
        });
      }

      res.json({
        status: "success",
        message: "Location data is valid",
      });
    } catch (e) {
      next(e);
    }
  }
);

