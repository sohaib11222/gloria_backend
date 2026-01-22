import { Router } from "express";
import { z } from "zod";
import fetch from "node-fetch";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";
/**
 * Convert PHP var_dump output to OTA/Gloria structure
 * This handles the case where PHP endpoints return var_dump() output instead of JSON/XML
 * The PHP var_dump shows an OTA_VehLocSearchRS structure that we need to convert
 * Client requested to use "gloria" format name, but we support both for compatibility
 */
function convertPhpVarDumpToOta(phpText) {
    try {
        const result = {
            OTA_VehLocSearchRS: {
                VehMatchedLocs: []
            },
            // Also support "gloria" format name as client requested
            gloria: {
                VehMatchedLocs: []
            }
        };
        // The structure is: ["VehMatchedLocs"]=> array(2) { [0]=> array(1) { ["VehMatchedLoc"]=> array(1) { ["LocationDetail"]=> ...
        // We need to extract each VehMatchedLoc block
        // Find the VehMatchedLocs array - match the opening and find the content
        // Pattern: ["VehMatchedLocs"]=> array(2) { ...content... }
        const vehMatchedLocsStart = phpText.indexOf('["VehMatchedLocs"]');
        if (vehMatchedLocsStart === -1) {
            throw new Error("Could not find VehMatchedLocs in PHP var_dump");
        }
        // Find the opening brace after array(count)
        let bracePos = phpText.indexOf('{', vehMatchedLocsStart);
        if (bracePos === -1) {
            throw new Error("Could not find opening brace for VehMatchedLocs");
        }
        // Find matching closing brace - count braces to find the end
        let braceCount = 1;
        let pos = bracePos + 1;
        let vehMatchedLocsEnd = -1;
        while (pos < phpText.length && braceCount > 0) {
            if (phpText[pos] === '{')
                braceCount++;
            if (phpText[pos] === '}')
                braceCount--;
            if (braceCount === 0) {
                vehMatchedLocsEnd = pos;
                break;
            }
            pos++;
        }
        if (vehMatchedLocsEnd === -1) {
            throw new Error("Could not find closing brace for VehMatchedLocs");
        }
        const vehMatchedLocsText = phpText.substring(bracePos + 1, vehMatchedLocsEnd);
        // Extract each indexed entry: [0]=> array(1) { ["VehMatchedLoc"]=> array(1) { ["LocationDetail"]=> ...
        // Use a pattern that finds [index]=> array(1) { ["VehMatchedLoc"]=> array(1) { ["LocationDetail"]=> array(count) { ...content... } } }
        const locations = [];
        // Find all LocationDetail blocks by looking for the pattern
        // [index]=> array(1) { ["VehMatchedLoc"]=> array(1) { ["LocationDetail"]=> array(count) { ...content... } } }
        let searchPos = 0;
        while (true) {
            // Find next LocationDetail
            const locationDetailStart = vehMatchedLocsText.indexOf('["LocationDetail"]', searchPos);
            if (locationDetailStart === -1)
                break;
            // Find the array(count) after LocationDetail
            const arrayStart = vehMatchedLocsText.indexOf('array(', locationDetailStart);
            if (arrayStart === -1)
                break;
            // Find the opening brace
            const contentStart = vehMatchedLocsText.indexOf('{', arrayStart);
            if (contentStart === -1)
                break;
            // Find matching closing brace for this LocationDetail
            let detailBraceCount = 1;
            let detailPos = contentStart + 1;
            let detailEnd = -1;
            while (detailPos < vehMatchedLocsText.length && detailBraceCount > 0) {
                if (vehMatchedLocsText[detailPos] === '{')
                    detailBraceCount++;
                if (vehMatchedLocsText[detailPos] === '}')
                    detailBraceCount--;
                if (detailBraceCount === 0) {
                    detailEnd = detailPos;
                    break;
                }
                detailPos++;
            }
            if (detailEnd === -1)
                break;
            const locationText = vehMatchedLocsText.substring(contentStart + 1, detailEnd);
            const locationDetail = parsePhpLocationDetail(locationText);
            if (locationDetail) {
                // Ensure the structure is correct - LocationDetail should have attr
                if (!locationDetail.attr && Object.keys(locationDetail).length > 0) {
                    console.warn(`[PHP Parser] LocationDetail missing attr, keys:`, Object.keys(locationDetail));
                }
                locations.push({
                    VehMatchedLoc: {
                        LocationDetail: locationDetail
                    }
                });
            }
            searchPos = detailEnd + 1;
        }
        console.log(`[PHP Parser] Extracted ${locations.length} locations from PHP var_dump`);
        if (locations.length === 0) {
            console.warn("[PHP Parser] No locations extracted from PHP var_dump");
            console.warn("[PHP Parser] VehMatchedLocs text length:", vehMatchedLocsText.length);
            console.warn("[PHP Parser] First 500 chars:", vehMatchedLocsText.substring(0, 500));
            console.warn("[PHP Parser] Contains LocationDetail:", vehMatchedLocsText.includes('["LocationDetail"]'));
        }
        else {
            // Log first location details for verification
            if (locations[0]?.VehMatchedLoc?.LocationDetail) {
                const firstLoc = locations[0].VehMatchedLoc.LocationDetail;
                console.log(`[PHP Parser] First location extracted:`, {
                    code: firstLoc.attr?.Code || firstLoc.attr?.BranchType,
                    name: firstLoc.attr?.Name,
                    hasAddress: !!firstLoc.Address,
                    hasCars: !!firstLoc.Cars
                });
            }
        }
        result.OTA_VehLocSearchRS.VehMatchedLocs = locations;
        result.gloria.VehMatchedLocs = locations; // Support "gloria" format name
        return result;
    }
    catch (error) {
        throw new Error(`Failed to parse PHP var_dump: ${error.message || String(error)}`);
    }
}
/**
 * Parse PHP LocationDetail structure from var_dump
 * Extracts key fields needed for branch import
 * Handles nested PHP array structures and converts to expected format
 */
function parsePhpLocationDetail(locationText) {
    const location = {
        attr: {}
    };
    // Extract attributes from ["attr"]=> array(8) { ... }
    // Handle nested braces - find the complete attr section
    const attrStart = locationText.indexOf('["attr"]');
    if (attrStart !== -1) {
        // Find array(count) after ["attr"]
        const arrayStart = locationText.indexOf('array(', attrStart);
        if (arrayStart !== -1) {
            // Find opening brace
            const braceStart = locationText.indexOf('{', arrayStart);
            if (braceStart !== -1) {
                // Find matching closing brace - need to count nested braces
                let braceCount = 1;
                let pos = braceStart + 1;
                let braceEnd = -1;
                while (pos < locationText.length && braceCount > 0) {
                    const char = locationText[pos];
                    if (char === '{')
                        braceCount++;
                    else if (char === '}')
                        braceCount--;
                    if (braceCount === 0) {
                        braceEnd = pos;
                        break;
                    }
                    pos++;
                }
                if (braceEnd !== -1) {
                    const attrSection = locationText.substring(braceStart + 1, braceEnd);
                    // Match: ["Key"]=> string(length) "value"
                    // Handle both single-line and multi-line values
                    // Pattern: ["Key"]=> string(N) "value"
                    // CRITICAL: Must match the exact PHP var_dump format
                    // Example: ["Code"]=> string(6) "DXBA02"
                    const attrRegex = /\["([^"]+)"\]\s*=>\s*string\(\d+\)\s*"([^"]*)"/g;
                    let attrMatch;
                    while ((attrMatch = attrRegex.exec(attrSection)) !== null) {
                        const key = attrMatch[1];
                        const value = attrMatch[2];
                        location.attr[key] = value;
                    }
                    // Debug: Log extracted attributes with full details
                    console.log(`[PHP Parser] Extracted ${Object.keys(location.attr).length} attributes:`, Object.keys(location.attr));
                    console.log(`[PHP Parser] Full attr object:`, JSON.stringify(location.attr, null, 2));
                    console.log(`[PHP Parser] Code:`, location.attr.Code || 'MISSING');
                    console.log(`[PHP Parser] BranchType:`, location.attr.BranchType || 'MISSING');
                    console.log(`[PHP Parser] Name:`, location.attr.Name || 'MISSING');
                    console.log(`[PHP Parser] Latitude:`, location.attr.Latitude || 'MISSING');
                    console.log(`[PHP Parser] Longitude:`, location.attr.Longitude || 'MISSING');
                    // CRITICAL: If Code is missing but BranchType exists, use BranchType as Code
                    // The PHP data shows: ["Code"]=> string(6) "DXBA02" in the attr section
                    if (!location.attr.Code && location.attr.BranchType) {
                        location.attr.Code = location.attr.BranchType;
                        console.log(`[PHP Parser] Using BranchType as Code:`, location.attr.Code);
                    }
                    // Ensure Code exists - it's critical for branch identification
                    if (!location.attr.Code) {
                        console.error(`[PHP Parser] ERROR: No Code found in attr! Available keys:`, Object.keys(location.attr));
                        console.error(`[PHP Parser] Attr section sample:`, attrSection.substring(0, 500));
                    }
                }
                else {
                    console.warn(`[PHP Parser] Could not find closing brace for attr section`);
                }
            }
            else {
                console.warn(`[PHP Parser] Could not find opening brace for attr section`);
            }
        }
        else {
            console.warn(`[PHP Parser] Could not find array( after ["attr"]`);
        }
    }
    else {
        console.warn(`[PHP Parser] Could not find ["attr"] in location text`);
    }
    // Extract Address components - handle nested structure
    location.Address = {};
    // AddressLine: ["AddressLine"]=> array(1) { ["value"]=> string(69) "..." }
    const addressLineMatch = locationText.match(/\["AddressLine"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
    if (addressLineMatch) {
        const valueMatch = addressLineMatch[1].match(/\["value"\]\s*=>\s*string\((\d+)\)\s*"([^"]*)"/);
        if (valueMatch) {
            location.Address.AddressLine = { value: valueMatch[2] };
        }
    }
    // CityName
    const cityMatch = locationText.match(/\["CityName"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
    if (cityMatch) {
        const valueMatch = cityMatch[1].match(/\["value"\]\s*=>\s*string\((\d+)\)\s*"([^"]*)"/);
        if (valueMatch) {
            location.Address.CityName = { value: valueMatch[2] };
        }
    }
    // PostalCode
    const postalMatch = locationText.match(/\["PostalCode"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
    if (postalMatch) {
        const valueMatch = postalMatch[1].match(/\["value"\]\s*=>\s*string\((\d+)\)\s*"([^"]*)"/);
        if (valueMatch) {
            location.Address.PostalCode = { value: valueMatch[2] };
        }
    }
    // CountryName: ["CountryName"]=> array(2) { ["value"]=> ..., ["attr"]=> ... }
    const countryMatch = locationText.match(/\["CountryName"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
    if (countryMatch) {
        location.Address.CountryName = {};
        const countryText = countryMatch[1];
        const valueMatch = countryText.match(/\["value"\]\s*=>\s*string\((\d+)\)\s*"([^"]*)"/);
        if (valueMatch) {
            location.Address.CountryName.value = valueMatch[2];
        }
        // Extract Code from attr
        const codeAttrMatch = countryText.match(/\["attr"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
        if (codeAttrMatch) {
            const codeMatch = codeAttrMatch[1].match(/\["Code"\]\s*=>\s*string\((\d+)\)\s*"([^"]*)"/);
            if (codeMatch) {
                location.Address.CountryName.attr = { Code: codeMatch[2] };
            }
        }
    }
    // Extract Telephone: ["Telephone"]=> array(1) { ["attr"]=> array(1) { ["PhoneNumber"]=> ... } }
    const telephoneMatch = locationText.match(/\["Telephone"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
    if (telephoneMatch) {
        const phoneAttrMatch = telephoneMatch[1].match(/\["attr"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
        if (phoneAttrMatch) {
            const phoneMatch = phoneAttrMatch[1].match(/\["PhoneNumber"\]\s*=>\s*string\((\d+)\)\s*"([^"]*)"/);
            if (phoneMatch) {
                location.Telephone = {
                    attr: {
                        PhoneNumber: phoneMatch[2]
                    }
                };
            }
        }
    }
    // Extract Opening hours - handle multiple times per day
    const openingMatch = locationText.match(/\["Opening"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
    if (openingMatch) {
        location.Opening = {};
        const openingText = openingMatch[1];
        // Extract each day: ["monday"]=> array(1) { ["attr"]=> array(1) { ["Open"]=> ... } }
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        for (const day of days) {
            const dayMatch = openingText.match(new RegExp(`\\["${day}"\\]\\s*=>\\s*array\\(\\d+\\)\\s*\\{([\\s\\S]*?)\\}\\s*\\}`));
            if (dayMatch) {
                const dayAttrMatch = dayMatch[1].match(/\["attr"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
                if (dayAttrMatch) {
                    const openMatch = dayAttrMatch[1].match(/\["Open"\]\s*=>\s*string\((\d+)\)\s*"([^"]*)"/);
                    if (openMatch) {
                        location.Opening[day] = {
                            attr: {
                                Open: openMatch[2]
                            }
                        };
                    }
                }
            }
        }
    }
    // Extract PickupInstructions
    const pickupMatch = locationText.match(/\["PickupInstructions"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
    if (pickupMatch) {
        const pickupAttrMatch = pickupMatch[1].match(/\["attr"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
        if (pickupAttrMatch) {
            const pickupValueMatch = pickupAttrMatch[1].match(/\["Pickup"\]\s*=>\s*string\((\d+)\)\s*"([^"]*)"/);
            if (pickupValueMatch) {
                location.PickupInstructions = {
                    attr: {
                        Pickup: pickupValueMatch[2]
                    }
                };
            }
        }
    }
    // Extract Cars - ACRISS codes for vehicles
    const carsMatch = locationText.match(/\["Cars"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
    if (carsMatch) {
        location.Cars = {};
        const carsText = carsMatch[1];
        // Extract Code array: ["Code"]=> array(6) { [0]=> array(1) { ["attr"]=> ... } }
        const codeArrayMatch = carsText.match(/\["Code"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
        if (codeArrayMatch) {
            const codeArrayText = codeArrayMatch[1];
            location.Cars.Code = [];
            // Extract each car code: [0]=> array(1) { ["attr"]=> array(7) { ["Acrisscode"]=> ... } }
            const carCodePattern = /\[(\d+)\]\s*=>\s*array\(\d+\)\s*\{\s*\["attr"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}\s*\}/g;
            let carMatch;
            while ((carMatch = carCodePattern.exec(codeArrayText)) !== null) {
                const carAttrText = carMatch[2];
                const carAttrs = {};
                // Extract all attributes from car attr section
                const carAttrRegex = /\["([^"]+)"\]\s*=>\s*string\((\d+)\)\s*"([^"]*)"/g;
                let carAttrMatch;
                while ((carAttrMatch = carAttrRegex.exec(carAttrText)) !== null) {
                    carAttrs[carAttrMatch[1]] = carAttrMatch[3];
                }
                if (Object.keys(carAttrs).length > 0) {
                    location.Cars.Code.push({
                        attr: carAttrs
                    });
                }
            }
        }
    }
    return location;
}
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
