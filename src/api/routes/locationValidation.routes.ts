import { Router } from "express";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType } from "../../infra/policies.js";
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
  requireCompanyType("SOURCE"),
  async (req: any, res, next) => {
    try {
      // Get company code for validation
      const company = await prisma.company.findUnique({
        where: { id: req.user.companyId },
        select: { companyCode: true, type: true },
      });

      if (!company || company.type !== "SOURCE") {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "Only SOURCE companies can validate locations",
        });
      }

      const payload = req.body;

      // Validate the payload
      const result = validateLocationPayload(payload, company.companyCode || undefined);

      if (!result.valid) {
        return res.status(422).json(result.error);
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

