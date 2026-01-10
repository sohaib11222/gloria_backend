import { Router } from "express";
import { z } from "zod";
import fetch from "node-fetch";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";
export const sourcesRouter = Router();
/**
 * @openapi
 * /sources/branches:
 *   get:
 *     tags: [Sources]
 *     summary: List own branches
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: locationType
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 */
sourcesRouter.get("/sources/branches", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const sourceId = req.user.companyId;
        const status = req.query.status;
        const locationType = req.query.locationType;
        const search = req.query.search;
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
        const offset = Math.max(0, Number(req.query.offset || 0));
        const where = {
            sourceId,
        };
        if (status) {
            where.status = status;
        }
        if (locationType) {
            where.locationType = locationType;
        }
        if (search) {
            where.OR = [
                { branchCode: { contains: search } },
                { name: { contains: search } },
                { city: { contains: search } },
            ];
        }
        const [branches, total] = await Promise.all([
            prisma.branch.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
            }),
            prisma.branch.count({ where }),
        ]);
        res.json({
            items: branches,
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /sources/branches:
 *   post:
 *     tags: [Sources]
 *     summary: Create a new branch
 *     security:
 *       - bearerAuth: []
 */
const createSourceBranchSchema = z.object({
    branchCode: z.string().min(1, "Branch code is required"),
    name: z.string().min(1, "Name is required"),
    status: z.string().optional(),
    locationType: z.string().optional(),
    collectionType: z.string().optional(),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    addressLine: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    countryCode: z.string().optional().nullable(),
    natoLocode: z.string().optional().nullable(),
    agreementId: z.string().optional().nullable(),
});
sourcesRouter.post("/sources/branches", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const sourceId = req.user.companyId;
        const body = createSourceBranchSchema.parse(req.body);
        // Check if branch code already exists for this source
        const existing = await prisma.branch.findUnique({
            where: {
                sourceId_branchCode: {
                    sourceId,
                    branchCode: body.branchCode,
                },
            },
        });
        if (existing) {
            return res.status(409).json({
                error: "BRANCH_CODE_EXISTS",
                message: `Branch with code ${body.branchCode} already exists`,
            });
        }
        // Validate natoLocode if provided
        if (body.natoLocode) {
            const locode = await prisma.uNLocode.findUnique({
                where: { unlocode: body.natoLocode },
            });
            if (!locode) {
                return res.status(400).json({
                    error: "INVALID_UNLOCODE",
                    message: `UN/LOCODE ${body.natoLocode} not found`,
                });
            }
        }
        // Validate agreementId if provided
        if (body.agreementId) {
            const agreement = await prisma.agreement.findFirst({
                where: {
                    id: body.agreementId,
                    sourceId,
                },
            });
            if (!agreement) {
                return res.status(400).json({
                    error: "INVALID_AGREEMENT",
                    message: "Agreement not found or does not belong to this source",
                });
            }
        }
        const branch = await prisma.branch.create({
            data: {
                sourceId,
                branchCode: body.branchCode,
                name: body.name,
                status: body.status || null,
                locationType: body.locationType || null,
                collectionType: body.collectionType || null,
                email: body.email || null,
                phone: body.phone || null,
                latitude: body.latitude || null,
                longitude: body.longitude || null,
                addressLine: body.addressLine || null,
                city: body.city || null,
                postalCode: body.postalCode || null,
                country: body.country || null,
                countryCode: body.countryCode || null,
                natoLocode: body.natoLocode || null,
                agreementId: body.agreementId || null,
            },
        });
        res.status(201).json(branch);
    }
    catch (e) {
        if (e.code === "P2002") {
            return res.status(409).json({
                error: "BRANCH_CODE_EXISTS",
                message: "Branch code already exists for this source",
            });
        }
        if (e.name === "ZodError") {
            return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "Invalid request data",
                errors: e.errors,
            });
        }
        next(e);
    }
});
/**
 * @openapi
 * /sources/branches/:id:
 *   get:
 *     tags: [Sources]
 *     summary: Get own branch details
 *     security:
 *       - bearerAuth: []
 */
sourcesRouter.get("/sources/branches/:id", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const { id } = req.params;
        const sourceId = req.user.companyId;
        const branch = await prisma.branch.findFirst({
            where: {
                id,
                sourceId, // Ensure branch belongs to this source
            },
        });
        if (!branch) {
            return res.status(404).json({ error: "BRANCH_NOT_FOUND", message: "Branch not found" });
        }
        res.json(branch);
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /sources/branches/:id:
 *   patch:
 *     tags: [Sources]
 *     summary: Update own branch
 *     security:
 *       - bearerAuth: []
 */
const updateSourceBranchSchema = z.object({
    name: z.string().optional(),
    status: z.string().optional(),
    locationType: z.string().optional(),
    collectionType: z.string().optional(),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    addressLine: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    countryCode: z.string().optional().nullable(),
    natoLocode: z.string().optional().nullable(),
});
sourcesRouter.patch("/sources/branches/:id", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const { id } = req.params;
        const sourceId = req.user.companyId;
        const body = updateSourceBranchSchema.parse(req.body);
        // Verify branch belongs to this source
        const existing = await prisma.branch.findFirst({
            where: {
                id,
                sourceId,
            },
        });
        if (!existing) {
            return res.status(404).json({ error: "BRANCH_NOT_FOUND", message: "Branch not found" });
        }
        // Validate natoLocode if provided
        if (body.natoLocode) {
            const locode = await prisma.uNLocode.findUnique({
                where: { unlocode: body.natoLocode },
            });
            if (!locode) {
                return res.status(400).json({
                    error: "INVALID_UNLOCODE",
                    message: `UN/LOCODE ${body.natoLocode} not found`,
                });
            }
        }
        const branch = await prisma.branch.update({
            where: { id },
            data: body,
        });
        res.json(branch);
    }
    catch (e) {
        if (e.code === "P2025") {
            return res.status(404).json({ error: "BRANCH_NOT_FOUND", message: "Branch not found" });
        }
        next(e);
    }
});
/**
 * @openapi
 * /sources/branches/unmapped:
 *   get:
 *     tags: [Sources]
 *     summary: List own branches without natoLocode
 *     security:
 *       - bearerAuth: []
 */
sourcesRouter.get("/sources/branches/unmapped", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const sourceId = req.user.companyId;
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
        const offset = Math.max(0, Number(req.query.offset || 0));
        const where = {
            sourceId,
            natoLocode: null,
        };
        const [branches, total] = await Promise.all([
            prisma.branch.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
            }),
            prisma.branch.count({ where }),
        ]);
        res.json({
            items: branches,
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /sources/import-branches:
 *   post:
 *     tags: [Sources]
 *     summary: Import branches from supplier endpoint (for own company)
 *     security:
 *       - bearerAuth: []
 */
sourcesRouter.post("/sources/import-branches", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const sourceId = req.user.companyId;
        // Load source and check approval
        const source = await prisma.company.findUnique({
            where: { id: sourceId },
            select: {
                id: true,
                companyName: true,
                type: true,
                status: true,
                approvalStatus: true,
                emailVerified: true,
                companyCode: true,
                httpEndpoint: true,
                whitelistedDomains: true,
            },
        });
        if (!source) {
            return res.status(404).json({ error: "SOURCE_NOT_FOUND", message: "Source not found" });
        }
        if (source.approvalStatus !== "APPROVED") {
            return res.status(400).json({
                error: "NOT_APPROVED",
                message: "Source must be approved before importing branches",
            });
        }
        if (!source.emailVerified) {
            return res.status(400).json({
                error: "EMAIL_NOT_VERIFIED",
                message: "Source email must be verified",
            });
        }
        // Use configured httpEndpoint or fallback to default based on company type
        const httpEndpoint = source.httpEndpoint ||
            (source.type === "AGENT"
                ? `http://localhost:9091`
                : `http://localhost:9090`);
        if (!httpEndpoint) {
            return res.status(400).json({
                error: "HTTP_ENDPOINT_NOT_CONFIGURED",
                message: "Source httpEndpoint must be configured",
            });
        }
        if (!source.companyCode) {
            return res.status(400).json({
                error: "COMPANY_CODE_MISSING",
                message: "Source companyCode must be set",
            });
        }
        // Enforce whitelist check
        const { enforceWhitelist } = await import("../../infra/whitelistEnforcement.js");
        try {
            await enforceWhitelist(sourceId, httpEndpoint);
        }
        catch (e) {
            return res.status(403).json({
                error: "WHITELIST_VIOLATION",
                message: e.message || "Endpoint not whitelisted",
            });
        }
        // Call supplier endpoint with Request-Type: LocationRq header
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        // Ensure httpEndpoint has a valid URL format
        let endpointUrl = httpEndpoint.trim();
        if (!endpointUrl.startsWith('http://') && !endpointUrl.startsWith('https://')) {
            endpointUrl = `http://${endpointUrl}`;
        }
        try {
            const response = await fetch(endpointUrl, {
                method: "GET",
                headers: {
                    "Request-Type": "LocationRq",
                    "Content-Type": "application/json",
                },
                signal: controller.signal,
                timeout: 30000,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                return res.status(response.status).json({
                    error: "SUPPLIER_ERROR",
                    message: `Supplier endpoint returned ${response.status}`,
                });
            }
            const data = await response.json();
            // Validate CompanyCode
            const dataTyped = data;
            if (dataTyped.CompanyCode !== source.companyCode) {
                return res.status(422).json({
                    error: "COMPANY_CODE_MISMATCH",
                    message: `Expected CompanyCode ${source.companyCode}, got ${dataTyped.CompanyCode}`,
                });
            }
            // Extract branches (assume data.Branches or data is array)
            const branches = Array.isArray(dataTyped.Branches) ? dataTyped.Branches : (Array.isArray(data) ? data : []);
            if (branches.length === 0) {
                return res.status(422).json({
                    error: "NO_BRANCHES",
                    message: "No branches found in supplier response",
                });
            }
            // Validate all branches
            const { validateLocationArray } = await import("../../services/locationValidation.js");
            const validation = validateLocationArray(branches, source.companyCode);
            if (!validation.valid) {
                return res.status(422).json({
                    error: "VALIDATION_FAILED",
                    message: `${validation.errors.length} branch(es) failed validation`,
                    errors: validation.errors,
                });
            }
            // Upsert branches
            let imported = 0;
            let updated = 0;
            for (const branch of branches) {
                const branchData = {
                    sourceId: source.id,
                    branchCode: branch.Branchcode,
                    name: branch.Name,
                    status: branch.Status || null,
                    locationType: branch.LocationType || null,
                    collectionType: branch.CollectionType || null,
                    email: branch.EmailAddress || null,
                    phone: branch.Telephone?.attr?.PhoneNumber || null,
                    latitude: typeof branch.Latitude === "number" ? branch.Latitude : null,
                    longitude: typeof branch.Longitude === "number" ? branch.Longitude : null,
                    addressLine: branch.Address?.AddressLine?.value || null,
                    city: branch.Address?.CityName?.value || null,
                    postalCode: branch.Address?.PostalCode?.value || null,
                    country: branch.Address?.CountryName?.value || null,
                    countryCode: branch.Address?.CountryName?.attr?.Code || null,
                    natoLocode: branch.NatoLocode || null,
                    rawJson: branch,
                };
                const existing = await prisma.branch.findUnique({
                    where: {
                        sourceId_branchCode: {
                            sourceId: source.id,
                            branchCode: branch.Branchcode,
                        },
                    },
                });
                if (existing) {
                    await prisma.branch.update({
                        where: { id: existing.id },
                        data: branchData,
                    });
                    updated++;
                }
                else {
                    await prisma.branch.create({
                        data: branchData,
                    });
                    imported++;
                }
            }
            res.json({
                message: "Branches imported successfully",
                imported,
                updated,
                total: branches.length,
            });
        }
        catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === "AbortError" || fetchError.code === "ETIMEDOUT") {
                return res.status(504).json({
                    error: "TIMEOUT",
                    message: `Supplier endpoint timeout after 30s: ${endpointUrl || httpEndpoint}`,
                });
            }
            // Handle fetch connection errors
            if (fetchError.message?.includes("fetch failed") || fetchError.code === "ECONNREFUSED" || fetchError.code === "ENOTFOUND") {
                return res.status(503).json({
                    error: "CONNECTION_ERROR",
                    message: `Cannot connect to supplier endpoint: ${endpointUrl || httpEndpoint}. Please ensure the source backend is running and accessible.`,
                    details: fetchError.message || fetchError.code,
                });
            }
            // Handle other fetch errors
            return res.status(500).json({
                error: "FETCH_ERROR",
                message: `Failed to fetch from supplier endpoint: ${endpointUrl || httpEndpoint}`,
                details: fetchError.message || String(fetchError),
            });
        }
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /sources/upload-branches:
 *   post:
 *     tags: [Sources]
 *     summary: Upload branches from JSON file (for own company)
 *     description: |
 *       Upload branch/location data from a JSON file.
 *       Validates CompanyCode, validates each branch, and upserts to database.
 *       Expected JSON format: { CompanyCode: string, Branches: [...] } or array of branches
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
 *               Branches:
 *                 type: array
 *                 items:
 *                   type: object
 */
sourcesRouter.post("/sources/upload-branches", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const sourceId = req.user.companyId;
        // Load source and check approval
        const source = await prisma.company.findUnique({
            where: { id: sourceId },
            select: {
                id: true,
                companyName: true,
                type: true,
                status: true,
                approvalStatus: true,
                emailVerified: true,
                companyCode: true,
                httpEndpoint: true,
                whitelistedDomains: true,
            },
        });
        if (!source) {
            return res.status(404).json({ error: "SOURCE_NOT_FOUND", message: "Source not found" });
        }
        if (source.approvalStatus !== "APPROVED") {
            return res.status(400).json({
                error: "NOT_APPROVED",
                message: "Source must be approved before uploading branches",
            });
        }
        if (!source.emailVerified) {
            return res.status(400).json({
                error: "EMAIL_NOT_VERIFIED",
                message: "Source email must be verified",
            });
        }
        if (!source.companyCode) {
            return res.status(400).json({
                error: "COMPANY_CODE_MISSING",
                message: "Source companyCode must be set",
            });
        }
        const data = req.body;
        if (!data) {
            return res.status(400).json({
                error: "INVALID_REQUEST",
                message: "Request body is required",
            });
        }
        // Validate CompanyCode if present
        const dataTyped = data;
        if (dataTyped.CompanyCode && dataTyped.CompanyCode !== source.companyCode) {
            return res.status(422).json({
                error: "COMPANY_CODE_MISMATCH",
                message: `Expected CompanyCode ${source.companyCode}, got ${dataTyped.CompanyCode}`,
            });
        }
        // Extract branches (assume data.Branches or data is array)
        const branches = Array.isArray(dataTyped.Branches) ? dataTyped.Branches : (Array.isArray(data) ? data : []);
        if (branches.length === 0) {
            return res.status(422).json({
                error: "NO_BRANCHES",
                message: "No branches found in uploaded data. Expected format: { CompanyCode: string, Branches: [...] } or array of branches",
            });
        }
        // Validate all branches
        const { validateLocationArray } = await import("../../services/locationValidation.js");
        const validation = validateLocationArray(branches, source.companyCode);
        if (!validation.valid) {
            return res.status(422).json({
                error: "VALIDATION_FAILED",
                message: `${validation.errors.length} branch(es) failed validation`,
                errors: validation.errors,
            });
        }
        // Upsert branches
        let imported = 0;
        let updated = 0;
        for (const branch of branches) {
            const branchData = {
                sourceId: source.id,
                branchCode: branch.Branchcode,
                name: branch.Name,
                status: branch.Status || null,
                locationType: branch.LocationType || null,
                collectionType: branch.CollectionType || null,
                email: branch.EmailAddress || null,
                phone: branch.Telephone?.attr?.PhoneNumber || null,
                latitude: typeof branch.Latitude === "number" ? branch.Latitude : null,
                longitude: typeof branch.Longitude === "number" ? branch.Longitude : null,
                addressLine: branch.Address?.AddressLine?.value || null,
                city: branch.Address?.CityName?.value || null,
                postalCode: branch.Address?.PostalCode?.value || null,
                country: branch.Address?.CountryName?.value || null,
                countryCode: branch.Address?.CountryName?.attr?.Code || null,
                natoLocode: branch.NatoLocode || null,
                rawJson: branch,
            };
            const existing = await prisma.branch.findUnique({
                where: {
                    sourceId_branchCode: {
                        sourceId: source.id,
                        branchCode: branch.Branchcode,
                    },
                },
            });
            if (existing) {
                await prisma.branch.update({
                    where: { id: existing.id },
                    data: branchData,
                });
                updated++;
            }
            else {
                await prisma.branch.create({
                    data: branchData,
                });
                imported++;
            }
        }
        res.json({
            message: "Branches uploaded successfully",
            imported,
            updated,
            total: branches.length,
        });
    }
    catch (e) {
        next(e);
    }
});
// ============================================================================
// Source Location Management Endpoints
// ============================================================================
/**
 * @openapi
 * /sources/locations/search:
 *   get:
 *     tags: [Sources]
 *     summary: Search UN/LOCODE database for locations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         schema: { type: string }
 *         description: Search term (searches in unlocode, place, country, iataCode)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 */
sourcesRouter.get("/sources/locations/search", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const query = String(req.query.query || "").trim();
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
        const cursor = String(req.query.cursor || "");
        const where = query
            ? {
                OR: [
                    { unlocode: { contains: query } },
                    { country: { contains: query } },
                    { place: { contains: query } },
                    { iataCode: { contains: query } },
                ],
            }
            : {};
        const rows = await prisma.uNLocode.findMany({
            where,
            take: limit + 1,
            ...(cursor ? { cursor: { unlocode: cursor }, skip: 1 } : {}),
            orderBy: { unlocode: "asc" },
        });
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit).map((r) => ({
            unlocode: r.unlocode,
            country: r.country,
            place: r.place,
            iata_code: r.iataCode || "",
            latitude: r.latitude || 0,
            longitude: r.longitude || 0,
        }));
        const next_cursor = hasMore ? rows[limit].unlocode : "";
        res.json({
            items,
            next_cursor,
            has_more: hasMore,
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /sources/locations:
 *   post:
 *     tags: [Sources]
 *     summary: Add a location to source coverage
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - unlocode
 *             properties:
 *               unlocode:
 *                 type: string
 *                 description: UN/LOCODE (e.g., GBMAN)
 */
const addLocationSchema = z.object({
    unlocode: z.string().min(1, "UN/LOCODE is required"),
});
sourcesRouter.post("/sources/locations", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const sourceId = req.user.companyId;
        const body = addLocationSchema.parse(req.body);
        const { unlocode } = body;
        // Verify the UN/LOCODE exists in the database
        const unlocodeEntry = await prisma.uNLocode.findUnique({
            where: { unlocode: unlocode.toUpperCase() },
        });
        if (!unlocodeEntry) {
            return res.status(404).json({
                error: "UNLOCODE_NOT_FOUND",
                message: `UN/LOCODE "${unlocode}" not found in database`,
            });
        }
        // Check if location is already added
        const existing = await prisma.sourceLocation.findUnique({
            where: {
                sourceId_unlocode: {
                    sourceId,
                    unlocode: unlocode.toUpperCase(),
                },
            },
        });
        if (existing) {
            return res.status(409).json({
                error: "LOCATION_ALREADY_ADDED",
                message: `Location "${unlocode}" is already in your coverage`,
            });
        }
        // Add location to source coverage
        const sourceLocation = await prisma.sourceLocation.create({
            data: {
                sourceId,
                unlocode: unlocode.toUpperCase(),
            },
            include: {
                loc: {
                    select: {
                        unlocode: true,
                        country: true,
                        place: true,
                        iataCode: true,
                        latitude: true,
                        longitude: true,
                    },
                },
            },
        });
        res.status(201).json({
            message: "Location added successfully",
            location: {
                unlocode: sourceLocation.loc.unlocode,
                country: sourceLocation.loc.country,
                place: sourceLocation.loc.place,
                iata_code: sourceLocation.loc.iataCode || "",
                latitude: sourceLocation.loc.latitude || 0,
                longitude: sourceLocation.loc.longitude || 0,
            },
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /sources/locations/{unlocode}:
 *   delete:
 *     tags: [Sources]
 *     summary: Remove a location from source coverage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: unlocode
 *         required: true
 *         schema:
 *           type: string
 */
sourcesRouter.delete("/sources/locations/:unlocode", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const sourceId = req.user.companyId;
        const unlocode = String(req.params.unlocode || "").toUpperCase().trim();
        if (!unlocode) {
            return res.status(400).json({
                error: "BAD_REQUEST",
                message: "UN/LOCODE is required",
            });
        }
        // Check if location exists in source coverage
        const sourceLocation = await prisma.sourceLocation.findUnique({
            where: {
                sourceId_unlocode: {
                    sourceId,
                    unlocode,
                },
            },
        });
        if (!sourceLocation) {
            return res.status(404).json({
                error: "LOCATION_NOT_FOUND",
                message: `Location "${unlocode}" is not in your coverage`,
            });
        }
        // Remove location from source coverage
        await prisma.sourceLocation.delete({
            where: {
                sourceId_unlocode: {
                    sourceId,
                    unlocode,
                },
            },
        });
        res.json({
            message: "Location removed successfully",
            unlocode,
        });
    }
    catch (e) {
        next(e);
    }
});
