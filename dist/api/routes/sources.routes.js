import { Router } from "express";
import { z } from "zod";
import fetch from "node-fetch";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";
import { parseXMLToGloria, extractBranchesFromGloria, validateXMLStructure } from "../../services/xmlParser.js";
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
// ============================================================================
// Branch Endpoint Configuration (MUST BE BEFORE /sources/branches/:id to avoid route conflicts)
// ============================================================================
/**
 * @openapi
 * /sources/branch-endpoint:
 *   get:
 *     tags: [Sources]
 *     summary: Get configured branch endpoint URL
 *     security:
 *       - bearerAuth: []
 */
sourcesRouter.get("/sources/branch-endpoint", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const sourceId = req.user.companyId;
        console.log(`[Branch Endpoint] GET /sources/branch-endpoint - Source ID: ${sourceId}`);
        const source = await prisma.company.findUnique({
            where: { id: sourceId },
            select: {
                id: true,
                branchEndpointUrl: true,
                companyName: true,
            },
        });
        if (!source) {
            console.log(`[Branch Endpoint] Source not found: ${sourceId}`);
            return res.status(404).json({ error: "SOURCE_NOT_FOUND", message: "Source not found" });
        }
        console.log(`[Branch Endpoint] Retrieved endpoint URL for source ${source.id} (${source.companyName}): ${source.branchEndpointUrl || 'null'}`);
        res.json({
            branchEndpointUrl: source.branchEndpointUrl || null,
        });
    }
    catch (e) {
        console.error(`[Branch Endpoint] Error getting branch endpoint:`, e);
        next(e);
    }
});
/**
 * @openapi
 * /sources/branch-endpoint:
 *   put:
 *     tags: [Sources]
 *     summary: Configure branch endpoint URL
 *     security:
 *       - bearerAuth: []
 */
sourcesRouter.put("/sources/branch-endpoint", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const sourceId = req.user.companyId;
        const { branchEndpointUrl } = req.body;
        console.log(`[Branch Endpoint] PUT /sources/branch-endpoint - Source ID: ${sourceId}`);
        console.log(`[Branch Endpoint] Request body:`, { branchEndpointUrl });
        if (!branchEndpointUrl || typeof branchEndpointUrl !== 'string') {
            console.log(`[Branch Endpoint] Validation failed: branchEndpointUrl is required and must be a string`);
            return res.status(400).json({
                error: "INVALID_REQUEST",
                message: "branchEndpointUrl is required and must be a string",
            });
        }
        // Validate URL format
        let validatedUrl;
        try {
            const url = new URL(branchEndpointUrl);
            validatedUrl = url.toString();
            console.log(`[Branch Endpoint] URL validation passed: ${validatedUrl}`);
        }
        catch {
            console.log(`[Branch Endpoint] URL validation failed: invalid URL format`);
            return res.status(400).json({
                error: "INVALID_URL",
                message: "branchEndpointUrl must be a valid URL",
            });
        }
        // Update the company with the branch endpoint URL
        const source = await prisma.company.update({
            where: { id: sourceId },
            data: { branchEndpointUrl: validatedUrl },
            select: {
                id: true,
                branchEndpointUrl: true,
                companyName: true,
            },
        });
        console.log(`[Branch Endpoint] Successfully updated branch endpoint URL for source ${source.id} (${source.companyName})`);
        console.log(`[Branch Endpoint] New endpoint URL: ${source.branchEndpointUrl}`);
        res.json({
            message: "Branch endpoint URL configured successfully",
            branchEndpointUrl: source.branchEndpointUrl,
        });
    }
    catch (e) {
        console.error(`[Branch Endpoint] Error updating branch endpoint:`, e);
        next(e);
    }
});
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
                branchEndpointUrl: true,
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
        // Use configured branchEndpointUrl, or fallback to httpEndpoint, or default
        const endpointUrl = source.branchEndpointUrl ||
            source.httpEndpoint ||
            (source.type === "AGENT"
                ? `http://localhost:9091`
                : `http://localhost:9090`);
        if (!endpointUrl) {
            return res.status(400).json({
                error: "ENDPOINT_NOT_CONFIGURED",
                message: "Source branchEndpointUrl or httpEndpoint must be configured",
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
            await enforceWhitelist(sourceId, endpointUrl);
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
        // Ensure endpointUrl has a valid URL format
        let finalEndpointUrl = endpointUrl.trim();
        if (!finalEndpointUrl.startsWith('http://') && !finalEndpointUrl.startsWith('https://')) {
            finalEndpointUrl = `http://${finalEndpointUrl}`;
        }
        try {
            const response = await fetch(finalEndpointUrl, {
                method: "GET",
                headers: {
                    "Request-Type": "LocationRq",
                    "Accept": "application/json, application/xml, text/xml",
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
            // Detect content type
            const contentType = response.headers.get('content-type') || '';
            let data;
            let branches = [];
            if (contentType.includes('xml') || contentType.includes('text/xml')) {
                // Parse XML response
                const xmlText = await response.text();
                // Validate XML structure
                const validation = validateXMLStructure(xmlText);
                if (!validation.valid) {
                    return res.status(422).json({
                        error: "INVALID_XML",
                        message: validation.error || "Invalid XML structure",
                    });
                }
                // Parse XML to Gloria format
                const gloriaResponse = parseXMLToGloria(xmlText);
                branches = extractBranchesFromGloria(gloriaResponse);
            }
            else {
                // Parse JSON response
                data = await response.json();
                // Extract branches (assume data.Branches or data is array)
                const dataTyped = data;
                branches = Array.isArray(dataTyped.Branches) ? dataTyped.Branches : (Array.isArray(data) ? data : []);
            }
            // Validate CompanyCode (only for JSON responses)
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                const dataTyped = data;
                if (dataTyped.CompanyCode && dataTyped.CompanyCode !== source.companyCode) {
                    return res.status(422).json({
                        error: "COMPANY_CODE_MISMATCH",
                        message: `Expected CompanyCode ${source.companyCode}, got ${dataTyped.CompanyCode}`,
                    });
                }
            }
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
                // Handle both JSON and XML formats
                const branchCode = branch.Branchcode || branch.attr?.Code || branch.Code;
                const branchName = branch.Name || branch.attr?.Name;
                const latitude = typeof branch.Latitude === "number"
                    ? branch.Latitude
                    : (branch.attr?.Latitude ? parseFloat(branch.attr.Latitude) : null);
                const longitude = typeof branch.Longitude === "number"
                    ? branch.Longitude
                    : (branch.attr?.Longitude ? parseFloat(branch.attr.Longitude) : null);
                const branchData = {
                    sourceId: source.id,
                    branchCode: branchCode,
                    name: branchName,
                    status: branch.Status || branch.attr?.Status || null,
                    locationType: branch.LocationType || branch.attr?.LocationType || null,
                    collectionType: branch.CollectionType || branch.attr?.CollectionType || null,
                    email: branch.EmailAddress || null,
                    phone: branch.Telephone?.attr?.PhoneNumber || branch.Telephone || null,
                    latitude: latitude,
                    longitude: longitude,
                    addressLine: branch.Address?.AddressLine?.value || branch.Address?.AddressLine || null,
                    city: branch.Address?.CityName?.value || branch.Address?.CityName || null,
                    postalCode: branch.Address?.PostalCode?.value || branch.Address?.PostalCode || null,
                    country: branch.Address?.CountryName?.value || branch.Address?.CountryName || null,
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
                    message: `Supplier endpoint timeout after 30s: ${finalEndpointUrl || endpointUrl}`,
                });
            }
            // Handle fetch connection errors
            if (fetchError.message?.includes("fetch failed") || fetchError.code === "ECONNREFUSED" || fetchError.code === "ENOTFOUND") {
                return res.status(503).json({
                    error: "CONNECTION_ERROR",
                    message: `Cannot connect to supplier endpoint: ${finalEndpointUrl || endpointUrl}. Please ensure the source backend is running and accessible.`,
                    details: fetchError.message || fetchError.code,
                });
            }
            // Handle other fetch errors
            return res.status(500).json({
                error: "FETCH_ERROR",
                message: `Failed to fetch from supplier endpoint: ${finalEndpointUrl || endpointUrl}`,
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
 *     summary: Upload branches from JSON or XML file (for own company)
 *     description: |
 *       Upload branch/location data from a JSON or XML file.
 *       Validates CompanyCode, validates each branch, and upserts to database.
 *       Expected JSON format: { CompanyCode: string, Branches: [...] } or array of branches
 *       Expected XML format: OTA_VehLocSearchRS or gloria format with VehMatchedLocs
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [json, xml]
 *               data:
 *                 type: string
 *                 description: JSON string or XML string
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
                branchEndpointUrl: true,
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
        const { format, data: rawData, ...data } = req.body;
        // Support both direct JSON body and format+data structure
        let branches = [];
        let parsedData = data;
        // If format is specified, parse accordingly
        if (format === 'xml' && rawData) {
            // Parse XML
            const validation = validateXMLStructure(rawData);
            if (!validation.valid) {
                return res.status(422).json({
                    error: "INVALID_XML",
                    message: validation.error || "Invalid XML structure",
                });
            }
            const gloriaResponse = parseXMLToGloria(rawData);
            branches = extractBranchesFromGloria(gloriaResponse);
        }
        else if (format === 'json' && rawData) {
            // Parse JSON string
            try {
                parsedData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            }
            catch (e) {
                return res.status(400).json({
                    error: "INVALID_JSON",
                    message: "Failed to parse JSON: " + e.message,
                });
            }
        }
        // If no format specified, assume JSON body
        if (!format && !rawData) {
            parsedData = data;
        }
        // Validate CompanyCode if present (only for JSON)
        if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)) {
            if (parsedData.CompanyCode && parsedData.CompanyCode !== source.companyCode) {
                return res.status(422).json({
                    error: "COMPANY_CODE_MISMATCH",
                    message: `Expected CompanyCode ${source.companyCode}, got ${parsedData.CompanyCode}`,
                });
            }
        }
        // Extract branches
        if (branches.length === 0) {
            const dataTyped = parsedData;
            branches = Array.isArray(dataTyped.Branches) ? dataTyped.Branches : (Array.isArray(parsedData) ? parsedData : []);
        }
        if (branches.length === 0) {
            return res.status(422).json({
                error: "NO_BRANCHES",
                message: "No branches found in uploaded data. Expected format: { CompanyCode: string, Branches: [...] } or array of branches, or XML with VehMatchedLocs",
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
            // Handle both JSON and XML formats
            const branchCode = branch.Branchcode || branch.attr?.Code || branch.Code;
            const branchName = branch.Name || branch.attr?.Name;
            const latitude = typeof branch.Latitude === "number"
                ? branch.Latitude
                : (branch.attr?.Latitude ? parseFloat(branch.attr.Latitude) : null);
            const longitude = typeof branch.Longitude === "number"
                ? branch.Longitude
                : (branch.attr?.Longitude ? parseFloat(branch.attr.Longitude) : null);
            const branchData = {
                sourceId: source.id,
                branchCode: branchCode,
                name: branchName,
                status: branch.Status || branch.attr?.Status || null,
                locationType: branch.LocationType || branch.attr?.LocationType || null,
                collectionType: branch.CollectionType || branch.attr?.CollectionType || null,
                email: branch.EmailAddress || null,
                phone: branch.Telephone?.attr?.PhoneNumber || branch.Telephone || null,
                latitude: latitude,
                longitude: longitude,
                addressLine: branch.Address?.AddressLine?.value || branch.Address?.AddressLine || null,
                city: branch.Address?.CityName?.value || branch.Address?.CityName || null,
                postalCode: branch.Address?.PostalCode?.value || branch.Address?.PostalCode || null,
                country: branch.Address?.CountryName?.value || branch.Address?.CountryName || null,
                countryCode: branch.Address?.CountryName?.attr?.Code || null,
                natoLocode: branch.NatoLocode || null,
                rawJson: branch,
            };
            const existing = await prisma.branch.findUnique({
                where: {
                    sourceId_branchCode: {
                        sourceId: source.id,
                        branchCode: branchCode,
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
/**
 * @openapi
 * /sources/branches/poll:
 *   get:
 *     tags: [Sources]
 *     summary: Long polling endpoint for branch updates
 *     description: |
 *       Polls for new branches from configured endpoint.
 *       Returns immediately if new branches are found, otherwise waits up to 30 seconds.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeout
 *         schema: { type: integer, default: 30000 }
 *         description: Polling timeout in milliseconds (max 60000)
 */
sourcesRouter.get("/sources/branches/poll", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const sourceId = req.user.companyId;
        const timeout = Math.min(60000, Math.max(5000, Number(req.query.timeout || 30000)));
        const source = await prisma.company.findUnique({
            where: { id: sourceId },
            select: {
                id: true,
                branchEndpointUrl: true,
                companyCode: true,
                approvalStatus: true,
                emailVerified: true,
            },
        });
        if (!source) {
            return res.status(404).json({ error: "SOURCE_NOT_FOUND", message: "Source not found" });
        }
        if (!source.branchEndpointUrl) {
            return res.status(400).json({
                error: "ENDPOINT_NOT_CONFIGURED",
                message: "Branch endpoint URL must be configured first",
            });
        }
        // Get current branch count
        const currentCount = await prisma.branch.count({
            where: { sourceId: source.id },
        });
        // Poll for new branches
        const startTime = Date.now();
        let newBranchesFound = false;
        let lastCount = currentCount;
        const pollInterval = setInterval(async () => {
            try {
                // Fetch from endpoint
                const response = await fetch(source.branchEndpointUrl, {
                    method: "GET",
                    headers: {
                        "Request-Type": "LocationRq",
                        "Accept": "application/json, application/xml, text/xml",
                    },
                    timeout: 10000,
                });
                if (!response.ok) {
                    return;
                }
                const contentType = response.headers.get('content-type') || '';
                let branches = [];
                if (contentType.includes('xml')) {
                    const xmlText = await response.text();
                    const validation = validateXMLStructure(xmlText);
                    if (validation.valid) {
                        const gloriaResponse = parseXMLToGloria(xmlText);
                        branches = extractBranchesFromGloria(gloriaResponse);
                    }
                }
                else {
                    const data = await response.json();
                    const dataTyped = data;
                    branches = Array.isArray(dataTyped.Branches) ? dataTyped.Branches : (Array.isArray(data) ? data : []);
                }
                // Check if we have new branches
                if (branches.length > lastCount) {
                    newBranchesFound = true;
                    clearInterval(pollInterval);
                    // Import new branches only
                    const newBranches = branches.slice(lastCount);
                    // Import logic here (similar to import-branches endpoint)
                    // For now, just return that new branches were found
                    res.json({
                        message: "New branches found",
                        newCount: newBranches.length,
                        totalCount: branches.length,
                    });
                }
                lastCount = branches.length;
            }
            catch (error) {
                // Continue polling on error
            }
            // Check timeout
            if (Date.now() - startTime >= timeout) {
                clearInterval(pollInterval);
                if (!newBranchesFound) {
                    res.json({
                        message: "No new branches found",
                        timeout: true,
                    });
                }
            }
        }, 5000); // Poll every 5 seconds
        // Set overall timeout
        setTimeout(() => {
            clearInterval(pollInterval);
            if (!res.headersSent) {
                res.json({
                    message: "Polling timeout",
                    timeout: true,
                });
            }
        }, timeout);
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
