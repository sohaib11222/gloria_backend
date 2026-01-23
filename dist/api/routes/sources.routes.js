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
            // Try alternative parsing - maybe the structure is different
            // Look for VehMatchedLoc directly
            const vehMatchedLocPattern = /\[(\d+)\]=>\s*array\(\d+\)\s*\{\s*\["VehMatchedLoc"\]/g;
            const matches = [...vehMatchedLocsText.matchAll(vehMatchedLocPattern)];
            console.warn("[PHP Parser] Found VehMatchedLoc patterns:", matches.length);
            if (matches.length > 0) {
                console.warn("[PHP Parser] Trying alternative extraction method...");
                // Try extracting by finding each [index]=> array pattern
                for (let i = 0; i < matches.length; i++) {
                    const match = matches[i];
                    const startPos = match.index || 0;
                    // Find the LocationDetail within this VehMatchedLoc
                    const locDetailStart = vehMatchedLocsText.indexOf('["LocationDetail"]', startPos);
                    if (locDetailStart !== -1) {
                        const arrayStart = vehMatchedLocsText.indexOf('array(', locDetailStart);
                        if (arrayStart !== -1) {
                            const contentStart = vehMatchedLocsText.indexOf('{', arrayStart);
                            if (contentStart !== -1) {
                                // Find matching closing brace
                                let braceCount = 1;
                                let pos = contentStart + 1;
                                let detailEnd = -1;
                                while (pos < vehMatchedLocsText.length && braceCount > 0) {
                                    if (vehMatchedLocsText[pos] === '{')
                                        braceCount++;
                                    if (vehMatchedLocsText[pos] === '}')
                                        braceCount--;
                                    if (braceCount === 0) {
                                        detailEnd = pos;
                                        break;
                                    }
                                    pos++;
                                }
                                if (detailEnd !== -1) {
                                    const locationText = vehMatchedLocsText.substring(contentStart + 1, detailEnd);
                                    const locationDetail = parsePhpLocationDetail(locationText);
                                    if (locationDetail) {
                                        locations.push({
                                            VehMatchedLoc: {
                                                LocationDetail: locationDetail
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                console.warn(`[PHP Parser] Alternative method extracted ${locations.length} locations`);
            }
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
                    // Updated regex to handle values that may contain escaped quotes or special characters
                    const attrRegex = /\["([^"]+)"\]\s*=>\s*string\(\d+\)\s*"((?:[^"\\]|\\.)*)"/g;
                    let attrMatch;
                    while ((attrMatch = attrRegex.exec(attrSection)) !== null) {
                        const key = attrMatch[1];
                        let value = attrMatch[2];
                        // Unescape any escaped characters
                        value = value.replace(/\\(.)/g, '$1');
                        location.attr[key] = value;
                    }
                    // If no attributes were extracted, try a more lenient pattern
                    if (Object.keys(location.attr).length === 0) {
                        console.warn('[PHP Parser] No attributes extracted with strict pattern, trying lenient pattern');
                        const lenientRegex = /\["([^"]+)"\]\s*=>\s*string\([^)]+\)\s*"([^"]*)"/g;
                        let lenientMatch;
                        while ((lenientMatch = lenientRegex.exec(attrSection)) !== null) {
                            const key = lenientMatch[1];
                            const value = lenientMatch[2];
                            location.attr[key] = value;
                        }
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
        // Trim and filter out empty strings - treat empty strings as undefined
        const status = req.query.status?.trim() || undefined;
        const locationType = req.query.locationType?.trim() || undefined;
        const search = req.query.search?.trim() || undefined;
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
        const offset = Math.max(0, Number(req.query.offset || 0));
        const where = {
            sourceId,
        };
        // Only add filters if they have actual values (not empty strings)
        if (status && status.length > 0) {
            where.status = status;
        }
        if (locationType && locationType.length > 0) {
            where.locationType = locationType;
        }
        // Only add search filter if search term exists
        // MySQL's default collation is case-insensitive, so contains should work case-insensitively
        if (search && search.length > 0) {
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
        // Get companyCode from authenticated user's company (automatically from source)
        // companyCode is optional - if not set, validation will skip CompanyCode checks
        const companyCode = source.companyCode || undefined;
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
            const fetchResponse = await fetch(finalEndpointUrl, {
                method: "GET",
                headers: {
                    "Request-Type": "LocationRq",
                    "Content-Type": "application/json",
                },
                signal: controller.signal,
                timeout: 30000,
            });
            clearTimeout(timeoutId);
            if (!fetchResponse.ok) {
                return res.status(fetchResponse.status).json({
                    error: "SUPPLIER_ERROR",
                    message: `Supplier endpoint returned ${fetchResponse.status}`,
                });
            }
            // Get response text first to handle both JSON and PHP var_dump formats
            let responseText = await fetchResponse.text();
            // Clean up response text - remove HTML tags if present
            if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
                console.log('[import-branches] Response appears to be HTML, attempting to extract text content');
                // Try to extract text between <pre> tags or body content
                const preMatch = responseText.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
                if (preMatch) {
                    responseText = preMatch[1];
                }
                else {
                    // Remove HTML tags
                    responseText = responseText.replace(/<[^>]+>/g, '');
                }
            }
            let data;
            let branches = [];
            // Try to parse as JSON first
            try {
                data = JSON.parse(responseText);
                console.log('[import-branches] Successfully parsed as JSON');
            }
            catch (jsonError) {
                // If JSON parsing fails, try to parse as PHP var_dump format
                console.log('[import-branches] Response is not JSON, attempting PHP var_dump parsing');
                console.log('[import-branches] Response text length:', responseText.length);
                console.log('[import-branches] Response text preview (first 1000 chars):', responseText.substring(0, 1000));
                console.log('[import-branches] Response text preview (last 500 chars):', responseText.substring(Math.max(0, responseText.length - 500)));
                try {
                    const gloriaResponse = convertPhpVarDumpToOta(responseText);
                    console.log('[import-branches] Converted to OTA format, structure:', {
                        hasOTA: !!gloriaResponse.OTA_VehLocSearchRS,
                        hasGloria: !!gloriaResponse.gloria,
                        vehMatchedLocsCount: gloriaResponse.OTA_VehLocSearchRS?.VehMatchedLocs?.length || gloriaResponse.gloria?.VehMatchedLocs?.length || 0
                    });
                    // Extract branches from OTA/Gloria format
                    const { extractBranchesFromGloria } = await import("../../services/xmlParser.js");
                    branches = extractBranchesFromGloria(gloriaResponse);
                    console.log(`[import-branches] Extracted ${branches.length} branches from PHP var_dump format`);
                    if (branches.length > 0) {
                        console.log('[import-branches] First branch sample:', JSON.stringify(branches[0], null, 2).substring(0, 2000));
                    }
                    else {
                        console.error('[import-branches] WARNING: No branches extracted from PHP var_dump!');
                        console.error('[import-branches] Gloria response structure:', JSON.stringify(gloriaResponse, null, 2).substring(0, 2000));
                    }
                }
                catch (phpError) {
                    console.error('[import-branches] PHP parsing error:', phpError);
                    console.error('[import-branches] PHP parsing error stack:', phpError.stack);
                    // Don't block import - return 200 with error info (client wants to store data)
                    console.warn('[import-branches] PHP parsing failed, but allowing request to complete as requested');
                    return res.status(200).json({
                        message: "Failed to parse response, but import attempted",
                        imported: 0,
                        updated: 0,
                        skipped: 0,
                        total: 0,
                        summary: {
                            total: 0,
                            valid: 0,
                            invalid: 0,
                            imported: 0,
                            updated: 0,
                            skipped: 0,
                        },
                        error: "INVALID_RESPONSE_FORMAT",
                        validationErrors: [{
                                index: 0,
                                branchCode: "UNKNOWN",
                                branchName: "UNKNOWN",
                                error: {
                                    error: `Failed to parse response: ${phpError.message || String(phpError)}. Expected JSON or PHP var_dump format.`,
                                    fields: ["Response parsing failed"],
                                },
                            }],
                        warnings: [
                            "Failed to parse supplier response. Please check the endpoint URL and response format.",
                            `Error: ${phpError.message || String(phpError)}`,
                        ],
                    });
                }
            }
            // If we already extracted branches from PHP format, skip JSON processing
            if (branches.length === 0 && data) {
                // Handle JSON format - check for OTA/Gloria structure
                if (data.OTA_VehLocSearchRS || data.gloria) {
                    // OTA/Gloria format
                    const { extractBranchesFromGloria } = await import("../../services/xmlParser.js");
                    branches = extractBranchesFromGloria(data);
                    console.log(`[import-branches] Extracted ${branches.length} branches from OTA/Gloria format`);
                }
                else {
                    // Standard JSON format - validate CompanyCode (warn but don't block)
                    const dataTyped = data;
                    if (dataTyped.CompanyCode && companyCode && dataTyped.CompanyCode !== companyCode) {
                        console.warn(`[import-branches] CompanyCode mismatch: expected ${companyCode}, got ${dataTyped.CompanyCode}, but proceeding with import`);
                        // Don't block - just log warning and continue
                    }
                    // Extract branches (assume data.Branches or data is array)
                    branches = Array.isArray(dataTyped.Branches) ? dataTyped.Branches : (Array.isArray(data) ? data : []);
                }
            }
            // Allow import even if no branches found (log warning but don't block)
            if (branches.length === 0) {
                console.warn('[import-branches] No branches found in supplier response, but allowing request to complete');
                // Don't return 422 - return 200 with empty result
                return res.status(200).json({
                    message: "No branches found in supplier response",
                    imported: 0,
                    updated: 0,
                    skipped: 0,
                    total: 0,
                    summary: {
                        total: 0,
                        valid: 0,
                        invalid: 0,
                        imported: 0,
                        updated: 0,
                        skipped: 0,
                    },
                    warnings: ["No branches found in supplier response. Please check the endpoint URL and response format."],
                });
            }
            // Debug: Log branches before validation
            console.log(`[import-branches] About to validate ${branches.length} branches`);
            if (branches.length > 0) {
                const firstBranch = branches[0];
                console.log('[import-branches] First branch before validation:', {
                    Branchcode: firstBranch.Branchcode,
                    Name: firstBranch.Name,
                    AtAirport: firstBranch.AtAirport,
                    LocationType: firstBranch.LocationType,
                    CollectionType: firstBranch.CollectionType,
                    Latitude: firstBranch.Latitude,
                    Longitude: firstBranch.Longitude,
                    EmailAddress: firstBranch.EmailAddress,
                    PhoneNumber: firstBranch.Telephone?.attr?.PhoneNumber,
                    CountryCode: firstBranch.Address?.CountryName?.attr?.Code,
                    HasOpening: !!firstBranch.Opening,
                    OpeningKeys: firstBranch.Opening ? Object.keys(firstBranch.Opening) : [],
                    FullBranch: JSON.stringify(firstBranch, null, 2).substring(0, 3000)
                });
                // Check if branch has required fields
                if (!firstBranch.Branchcode || !firstBranch.Name || !firstBranch.AtAirport) {
                    console.error('[import-branches] CRITICAL: Branch missing required fields!');
                    console.error('[import-branches] Branch structure:', Object.keys(firstBranch));
                    console.error('[import-branches] Full branch object:', JSON.stringify(firstBranch, null, 2));
                }
            }
            // Validate all branches - but allow import even if validation fails (client requirement)
            // Use companyCode from authenticated user's company (automatically from source)
            // Convert null to undefined for validation (companyCode is optional)
            const { validateLocationArray } = await import("../../services/locationValidation.js");
            const validation = validateLocationArray(branches, companyCode);
            console.log(`[import-branches] Validation result: valid=${validation.valid}, errors=${validation.errors.length}`);
            // Log validation errors but don't block import (client wants to store data even if validation fails)
            if (validation.errors.length > 0) {
                console.warn(`[import-branches] ${validation.errors.length} branch(es) have validation issues, but proceeding with import as requested`);
                validation.errors.forEach((err, idx) => {
                    const branch = branches[err.index];
                    console.warn(`[import-branches] Validation issue ${idx + 1}:`, {
                        index: err.index,
                        branchCode: branch?.Branchcode || branch?.Code || 'UNKNOWN',
                        branchName: branch?.Name || 'UNKNOWN',
                        error: err.error,
                    });
                });
            }
            // Upsert branches - extract all available fields, use defaults for missing ones
            let imported = 0;
            let updated = 0;
            let skipped = 0;
            for (const branch of branches) {
                // Extract branch code - try multiple possible fields and nested structures
                let branchCode = branch.Branchcode ||
                    branch.Code ||
                    branch.attr?.Code ||
                    branch.attr?.BranchType ||
                    branch.LocationDetail?.attr?.Code ||
                    branch.LocationDetail?.attr?.BranchType ||
                    '';
                // If still no code, try to extract from raw structure
                if (!branchCode && branch.rawJson) {
                    branchCode = branch.rawJson.Code ||
                        branch.rawJson.BranchType ||
                        branch.rawJson.attr?.Code ||
                        branch.rawJson.attr?.BranchType ||
                        '';
                }
                // Generate a branch code if missing (don't skip - user can fix later)
                if (!branchCode) {
                    console.warn(`[import-branches] No branch code found, generating one:`, {
                        branchKeys: Object.keys(branch),
                        branchSample: JSON.stringify(branch, null, 2).substring(0, 1000)
                    });
                    // Generate a unique code based on name or timestamp
                    const nameForCode = branch.Name || branch.attr?.Name || branch.LocationDetail?.attr?.Name || 'BRANCH';
                    branchCode = `${nameForCode}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_').substring(0, 50);
                    console.warn(`[import-branches] Generated branch code: ${branchCode}`);
                }
                // Extract name - try multiple sources, use null if missing (user can fill later)
                const name = branch.Name ||
                    branch.attr?.Name ||
                    branch.LocationDetail?.attr?.Name ||
                    branch.rawJson?.Name ||
                    branch.rawJson?.attr?.Name ||
                    null; // Store as null if missing
                // Extract coordinates - handle both number and string formats, try multiple sources
                // Store as null if missing (user can fill later)
                let latitude = null;
                let longitude = null;
                // Try multiple sources for latitude
                const latValue = branch.Latitude ||
                    branch.attr?.Latitude ||
                    branch.LocationDetail?.attr?.Latitude ||
                    branch.rawJson?.Latitude ||
                    branch.rawJson?.attr?.Latitude;
                if (latValue !== undefined && latValue !== null && latValue !== '') {
                    const lat = typeof latValue === 'number' ? latValue : parseFloat(String(latValue));
                    if (!isNaN(lat))
                        latitude = lat;
                }
                // Try multiple sources for longitude
                const lonValue = branch.Longitude ||
                    branch.attr?.Longitude ||
                    branch.LocationDetail?.attr?.Longitude ||
                    branch.rawJson?.Longitude ||
                    branch.rawJson?.attr?.Longitude;
                if (lonValue !== undefined && lonValue !== null && lonValue !== '') {
                    const lon = typeof lonValue === 'number' ? lonValue : parseFloat(String(lonValue));
                    if (!isNaN(lon))
                        longitude = lon;
                }
                // Extract AtAirport - try multiple sources, use null if missing
                const atAirportValue = branch.AtAirport ||
                    branch.attr?.AtAirport ||
                    branch.LocationDetail?.attr?.AtAirport ||
                    branch.rawJson?.AtAirport ||
                    branch.rawJson?.attr?.AtAirport;
                // Store as null if missing, otherwise convert to string
                const atAirport = atAirportValue === undefined || atAirportValue === null || atAirportValue === ''
                    ? null
                    : (atAirportValue === 'true' || atAirportValue === true ? 'true' : 'false');
                // Extract location type - try multiple sources, use null if missing
                const locationType = branch.LocationType ||
                    branch.attr?.LocationType ||
                    branch.LocationDetail?.attr?.LocationType ||
                    branch.rawJson?.LocationType ||
                    branch.rawJson?.attr?.LocationType ||
                    null;
                // Extract collection type - try multiple sources, derive from AtAirport if possible
                const collectionType = branch.CollectionType ||
                    branch.attr?.CollectionType ||
                    branch.LocationDetail?.attr?.CollectionType ||
                    branch.rawJson?.CollectionType ||
                    branch.rawJson?.attr?.CollectionType ||
                    (atAirport === 'true' ? 'AIRPORT' : (atAirport === 'false' ? 'CITY' : null));
                // Extract phone - handle multiple formats, use null if missing
                const phone = branch.Telephone?.attr?.PhoneNumber ||
                    branch.Telephone?.PhoneNumber ||
                    branch.phone ||
                    null;
                // Extract email - use null if missing
                const email = branch.EmailAddress || branch.email || null;
                // Extract address components
                const addressLine = branch.Address?.AddressLine?.value ||
                    branch.Address?.AddressLine ||
                    branch.addressLine ||
                    null;
                const city = branch.Address?.CityName?.value ||
                    branch.Address?.CityName ||
                    branch.city ||
                    null;
                const postalCode = branch.Address?.PostalCode?.value ||
                    branch.Address?.PostalCode ||
                    branch.postalCode ||
                    null;
                const country = branch.Address?.CountryName?.value ||
                    branch.Address?.CountryName ||
                    branch.country ||
                    null;
                const countryCode = branch.Address?.CountryName?.attr?.Code ||
                    branch.Address?.CountryName?.Code ||
                    branch.countryCode ||
                    null;
                // Build branch data - store missing fields as null (user can fill later)
                const branchData = {
                    sourceId: source.id,
                    branchCode: branchCode, // Required - skip if missing
                    name: name || null, // Store as null if missing
                    status: branch.Status || 'ACTIVE',
                    locationType: locationType || null, // Store as null if missing
                    collectionType: collectionType || null, // Store as null if missing
                    email: email || null, // Store as null if missing
                    phone: phone || null, // Store as null if missing
                    latitude: latitude || null, // Store as null if missing
                    longitude: longitude || null, // Store as null if missing
                    addressLine: addressLine || null, // Store as null if missing
                    city: city || null, // Store as null if missing
                    postalCode: postalCode || null, // Store as null if missing
                    country: country || null, // Store as null if missing
                    countryCode: countryCode || null, // Store as null if missing
                    natoLocode: branch.NatoLocode || null,
                    rawJson: branch, // Store raw data for reference
                };
                const existing = await prisma.branch.findUnique({
                    where: {
                        sourceId_branchCode: {
                            sourceId: source.id,
                            branchCode: branchCode, // Use extracted branchCode, not branch.Branchcode
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
            // Return success even if validation had issues (client requirement)
            // Always return 200 status, never block import due to validation
            const message = validation.valid
                ? "Branches imported successfully"
                : `Branches imported successfully. ${validation.errors.length} branch(es) had validation issues but were still imported.`;
            // Enhance validation errors with detailed information
            const enhancedValidationErrors = validation.errors.map((err) => {
                const branch = branches[err.index];
                const errorDetails = err.error || {};
                // Extract missing fields and validation errors separately
                const allFields = errorDetails.fields || [];
                const missingFields = allFields.filter((f) => !f.includes(':') && !f.includes('Invalid'));
                const validationErrorMessages = allFields.filter((f) => f.includes(':') || f.includes('Invalid'));
                // Get branch code and name from multiple possible locations
                const branchCode = branch?.Branchcode ||
                    branch?.Code ||
                    branch?.attr?.Code ||
                    branch?.attr?.BranchType ||
                    branch?.LocationDetail?.attr?.Code ||
                    branch?.LocationDetail?.attr?.BranchType ||
                    'UNKNOWN';
                const branchName = branch?.Name ||
                    branch?.attr?.Name ||
                    branch?.LocationDetail?.attr?.Name ||
                    'UNKNOWN';
                // Show what fields ARE present for debugging
                const presentFields = branch ? Object.keys(branch).filter(key => {
                    const value = branch[key];
                    return value !== undefined && value !== null && value !== '' &&
                        !Array.isArray(value) || (Array.isArray(value) && value.length > 0);
                }) : [];
                // Create detailed error message
                const errorMessage = errorDetails.error || "Location validation failed";
                let detailedMessage = errorMessage;
                if (missingFields.length > 0) {
                    detailedMessage += ` Missing fields: ${missingFields.join(', ')}.`;
                }
                if (validationErrorMessages.length > 0) {
                    detailedMessage += ` Validation issues: ${validationErrorMessages.join('; ')}.`;
                }
                if (errorDetails.days && errorDetails.days.length > 0) {
                    detailedMessage += ` Invalid opening hours for: ${errorDetails.days.join(', ')}.`;
                }
                return {
                    index: err.index,
                    branchCode: branchCode,
                    branchName: branchName,
                    error: {
                        error: detailedMessage,
                        message: detailedMessage,
                        fields: errorDetails.fields || [],
                        days: errorDetails.days,
                        missingFields: missingFields.length > 0 ? missingFields : undefined,
                        validationErrors: validationErrorMessages.length > 0 ? validationErrorMessages : undefined,
                        invalidDays: errorDetails.days,
                        details: errorDetails.details || {
                            missingFields: missingFields.length > 0 ? missingFields : undefined,
                            validationErrors: validationErrorMessages.length > 0 ? validationErrorMessages : undefined,
                            invalidDays: errorDetails.days,
                        },
                        // Debugging info
                        presentFields: presentFields,
                        branchStructure: branch ? {
                            hasBranchcode: !!branch.Branchcode,
                            hasCode: !!branch.Code,
                            hasAttr: !!branch.attr,
                            hasLocationDetail: !!branch.LocationDetail,
                            topLevelKeys: Object.keys(branch),
                        } : null,
                    },
                };
            });
            // Always return 200 (success) even if validation fails - client wants to store data
            // Include detailed validation information in response
            const uploadResponse = {
                message,
                imported,
                updated,
                skipped,
                total: branches.length,
                summary: {
                    total: branches.length,
                    valid: branches.length - validation.errors.length,
                    invalid: validation.errors.length,
                    imported,
                    updated,
                    skipped,
                },
            };
            // Add validation errors if any
            if (validation.errors.length > 0) {
                uploadResponse.validationErrors = enhancedValidationErrors;
                uploadResponse.invalidDetails = enhancedValidationErrors;
                uploadResponse.warnings = [
                    `${validation.errors.length} branch(es) had validation issues but were still imported.`,
                    'Check the validationErrors array for detailed information about what fields are missing or invalid.'
                ];
            }
            res.status(200).json(uploadResponse);
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
        // Get companyCode from authenticated user's company (automatically from source)
        // companyCode is optional - if not set, validation will skip CompanyCode checks
        const companyCode = source.companyCode || undefined;
        const data = req.body;
        if (!data) {
            return res.status(400).json({
                error: "INVALID_REQUEST",
                message: "Request body is required",
            });
        }
        console.log('[upload-branches] Received data type:', typeof data);
        console.log('[upload-branches] Data keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');
        if (data && typeof data === 'object' && data.rawContent) {
            console.log('[upload-branches] Found rawContent, length:', data.rawContent?.length || 0);
            console.log('[upload-branches] rawContent preview:', data.rawContent?.substring(0, 200) || 'N/A');
        }
        let branches = [];
        // Check if data is a string (pasted PHP var_dump or XML)
        // Note: When axios sends a string with Content-Type: application/json,
        // it JSON-stringifies it: "array(1)..." becomes "\"array(1)...\""
        // Express body-parser then parses this JSON, so we get the string back
        let content = null;
        // First, check for rawContent key specifically (from frontend) - check this FIRST
        if (data && typeof data === 'object' && data.rawContent && typeof data.rawContent === 'string') {
            const rawValue = data.rawContent;
            console.log('[upload-branches] Found rawContent in object, length:', rawValue.length);
            if (rawValue.includes('array(') || rawValue.includes('OTA_VehLocSearchRS') || rawValue.includes('<')) {
                content = rawValue.trim();
                console.log('[upload-branches] Using rawContent, trimmed length:', content?.length || 0);
            }
        }
        // If not found in rawContent, check if it's already a string (Express parsed the JSON-stringified string)
        if (!content && typeof data === 'string') {
            content = data.trim();
            console.log('[upload-branches] Data is string, using directly, length:', content.length);
        }
        else if (!content && data && typeof data === 'object') {
            // Check if it's wrapped in an object (e.g., { data: "..." })
            const keys = Object.keys(data);
            if (keys.length === 1) {
                const value = data[keys[0]];
                if (typeof value === 'string' && (value.includes('array(') || value.includes('OTA_VehLocSearchRS') || value.includes('<'))) {
                    content = value.trim();
                    console.log('[upload-branches] Found string in single-key object, length:', content.length);
                }
            }
            // Also try to detect if the entire object stringifies to a PHP var_dump pattern
            const dataStr = JSON.stringify(data);
            // If it's a JSON-stringified string (starts and ends with quotes), unwrap it
            if (dataStr.startsWith('"') && dataStr.endsWith('"') && dataStr.length > 2) {
                try {
                    const unwrapped = JSON.parse(dataStr);
                    if (typeof unwrapped === 'string' && (unwrapped.includes('array(') || unwrapped.includes('OTA_VehLocSearchRS'))) {
                        content = unwrapped.trim();
                        console.log('[upload-branches] Unwrapped JSON string, length:', content.length);
                    }
                }
                catch (e) {
                    // Not a JSON string
                }
            }
        }
        // If we found content as a string (PHP var_dump or XML), process it
        // Also process if content is empty but data might be PHP format
        if (content && typeof content === 'string') {
            console.log(`[upload-branches] Processing string content, length: ${content.length}, includes array(: ${content.includes('array(')}, includes OTA_VehLocSearchRS: ${content.includes('OTA_VehLocSearchRS')}`);
            console.log(`[upload-branches] Content first 200 chars:`, content.substring(0, 200));
            // Check if it's PHP var_dump format
            if (content.includes('array(') && content.includes('OTA_VehLocSearchRS')) {
                try {
                    console.log('[upload-branches] Detected PHP var_dump format, parsing...');
                    // Parse PHP var_dump format
                    const gloriaResponse = convertPhpVarDumpToOta(content);
                    console.log('[upload-branches] PHP var_dump parsed, gloriaResponse structure:', {
                        hasOTA: !!gloriaResponse.OTA_VehLocSearchRS,
                        hasGloria: !!gloriaResponse.gloria,
                        otaKeys: gloriaResponse.OTA_VehLocSearchRS ? Object.keys(gloriaResponse.OTA_VehLocSearchRS) : [],
                        vehMatchedLocsCount: gloriaResponse.OTA_VehLocSearchRS?.VehMatchedLocs?.length || gloriaResponse.gloria?.VehMatchedLocs?.length || 0,
                    });
                    const { extractBranchesFromGloria } = await import("../../services/xmlParser.js");
                    branches = extractBranchesFromGloria(gloriaResponse);
                    console.log(`[upload-branches] Extracted ${branches.length} branches from PHP var_dump format`);
                    // If extraction failed, try manual extraction as fallback
                    if (branches.length === 0) {
                        console.warn('[upload-branches] extractBranchesFromGloria returned 0 branches, attempting manual extraction...');
                        const root = gloriaResponse.gloria || gloriaResponse.OTA_VehLocSearchRS;
                        if (root && root.VehMatchedLocs && root.VehMatchedLocs.length > 0) {
                            console.warn(`[upload-branches] Found ${root.VehMatchedLocs.length} VehMatchedLocs, extracting manually...`);
                            try {
                                // Manually extract branches from the structure
                                for (const loc of root.VehMatchedLocs) {
                                    const locationDetail = loc.VehMatchedLoc?.LocationDetail;
                                    if (locationDetail && locationDetail.attr) {
                                        // Create a normalized branch directly
                                        const attr = locationDetail.attr;
                                        const branchCode = attr.Code || attr.BranchType || `BRANCH_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                                        // Extract address components
                                        const address = locationDetail.Address || {};
                                        const addressLine = address.AddressLine?.value || address.AddressLine || '';
                                        const cityName = address.CityName?.value || address.CityName || '';
                                        const postalCode = address.PostalCode?.value || address.PostalCode || '';
                                        const countryName = address.CountryName?.value || address.CountryName || '';
                                        const countryCode = address.CountryName?.attr?.Code || address.CountryName?.Code || '';
                                        // Extract phone
                                        const phoneNumber = locationDetail.Telephone?.attr?.PhoneNumber || locationDetail.Telephone?.PhoneNumber || '';
                                        // Extract opening hours
                                        const opening = locationDetail.Opening || {};
                                        const normalizedBranch = {
                                            Branchcode: branchCode,
                                            Name: attr.Name || null,
                                            AtAirport: attr.AtAirport === 'true' || attr.AtAirport === true ? 'true' : (attr.AtAirport === 'false' || attr.AtAirport === false ? 'false' : null),
                                            LocationType: attr.LocationType || null,
                                            CollectionType: attr.CollectionType || (attr.AtAirport === 'true' ? 'AIRPORT' : (attr.AtAirport === 'false' ? 'CITY' : null)),
                                            Latitude: attr.Latitude ? parseFloat(String(attr.Latitude)) : undefined,
                                            Longitude: attr.Longitude ? parseFloat(String(attr.Longitude)) : undefined,
                                            EmailAddress: locationDetail.EmailAddress || `branch-${branchCode}@example.com`,
                                            Telephone: phoneNumber ? {
                                                attr: {
                                                    PhoneNumber: phoneNumber
                                                }
                                            } : {
                                                attr: {
                                                    PhoneNumber: '+00000000000'
                                                }
                                            },
                                            Address: {
                                                AddressLine: { value: addressLine || '' },
                                                CityName: { value: cityName || '' },
                                                PostalCode: { value: postalCode || '' },
                                                CountryName: {
                                                    value: countryName || '',
                                                    attr: { Code: countryCode || '' }
                                                }
                                            },
                                            Opening: opening || {},
                                            Status: 'ACTIVE',
                                        };
                                        branches.push(normalizedBranch);
                                        console.log(`[upload-branches] Manually extracted branch: ${branchCode} (${attr.Name || 'UNNAMED'})`);
                                    }
                                }
                                console.log(`[upload-branches] Manual extraction resulted in ${branches.length} branches`);
                            }
                            catch (manualError) {
                                console.error('[upload-branches] Manual extraction failed:', manualError);
                                console.error('[upload-branches] Manual extraction error stack:', manualError.stack);
                            }
                        }
                        else {
                            console.error('[upload-branches] No root or VehMatchedLocs found for manual extraction');
                            console.error('[upload-branches] Gloria response structure:', JSON.stringify(gloriaResponse, null, 2).substring(0, 2000));
                        }
                    }
                    if (branches.length > 0) {
                        console.log('[upload-branches] First branch sample:', {
                            Branchcode: branches[0].Branchcode,
                            Name: branches[0].Name,
                            AtAirport: branches[0].AtAirport,
                            LocationType: branches[0].LocationType,
                            keys: Object.keys(branches[0]),
                        });
                    }
                }
                catch (phpError) {
                    console.error('[upload-branches] PHP parsing error:', phpError);
                    return res.status(200).json({
                        message: "Failed to parse PHP var_dump format",
                        imported: 0,
                        updated: 0,
                        skipped: 0,
                        total: 0,
                        summary: {
                            total: 0,
                            valid: 0,
                            invalid: 0,
                            imported: 0,
                            updated: 0,
                            skipped: 0,
                        },
                        error: "INVALID_RESPONSE_FORMAT",
                        validationErrors: [{
                                index: 0,
                                branchCode: "UNKNOWN",
                                branchName: "UNKNOWN",
                                error: {
                                    error: `Failed to parse PHP var_dump format: ${phpError.message || String(phpError)}`,
                                    fields: ["PHP parsing failed"],
                                },
                            }],
                        warnings: [`Failed to parse PHP var_dump format. Please check the data format.`],
                    });
                }
            }
            else {
                // Try to parse as JSON string
                try {
                    const jsonData = JSON.parse(content);
                    if (jsonData.OTA_VehLocSearchRS || jsonData.gloria) {
                        const { extractBranchesFromGloria } = await import("../../services/xmlParser.js");
                        branches = extractBranchesFromGloria(jsonData);
                    }
                    else {
                        branches = Array.isArray(jsonData.Branches) ? jsonData.Branches : (Array.isArray(jsonData) ? jsonData : []);
                    }
                }
                catch (jsonError) {
                    return res.status(200).json({
                        message: "Failed to parse data",
                        imported: 0,
                        updated: 0,
                        skipped: 0,
                        total: 0,
                        summary: {
                            total: 0,
                            valid: 0,
                            invalid: 0,
                            imported: 0,
                            updated: 0,
                            skipped: 0,
                        },
                        error: "INVALID_FORMAT",
                        validationErrors: [{
                                index: 0,
                                branchCode: "UNKNOWN",
                                branchName: "UNKNOWN",
                                error: {
                                    error: "Could not parse data. Expected JSON, PHP var_dump, or XML format.",
                                    fields: ["Data parsing failed"],
                                },
                            }],
                        warnings: [`Could not parse the provided data. Please check the format.`],
                    });
                }
            }
        }
        // If we still don't have branches and data is an object (not processed as string), try to extract from it
        if (branches.length === 0 && data && typeof data === 'object' && !content) {
            const dataTyped = data;
            console.log('[upload-branches] Processing as JSON object (no content extracted), keys:', Object.keys(dataTyped));
            // Check if it has OTA structure directly
            if (dataTyped.OTA_VehLocSearchRS || dataTyped.gloria) {
                console.log('[upload-branches] Found OTA structure in object, extracting branches...');
                const { extractBranchesFromGloria } = await import("../../services/xmlParser.js");
                branches = extractBranchesFromGloria(dataTyped);
                console.log(`[upload-branches] Extracted ${branches.length} branches from OTA structure`);
            }
            else {
                // Try standard JSON format
                branches = Array.isArray(dataTyped.Branches) ? dataTyped.Branches : (Array.isArray(data) ? data : []);
                console.log(`[upload-branches] Extracted ${branches.length} branches from JSON structure`);
            }
            // Validate CompanyCode if present (but don't block)
            // Use companyCode from authenticated user's company (automatically from source)
            if (dataTyped.CompanyCode && companyCode && dataTyped.CompanyCode !== companyCode) {
                console.warn(`[upload-branches] CompanyCode mismatch: expected ${companyCode}, got ${dataTyped.CompanyCode}, but proceeding with upload`);
            }
        }
        // Log final branch count before checking
        console.log(`[upload-branches] Final branch count: ${branches.length}`);
        if (branches.length === 0) {
            console.warn('[upload-branches] No branches extracted. Data type:', typeof data);
            console.warn('[upload-branches] Data structure:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');
            if (content) {
                console.warn('[upload-branches] Content preview (first 500 chars):', content.substring(0, 500));
                console.warn('[upload-branches] Content preview (last 500 chars):', content.substring(Math.max(0, content.length - 500)));
                // Try one more time to parse if we have content but no branches
                if (content.includes('array(') && content.includes('OTA_VehLocSearchRS')) {
                    console.warn('[upload-branches] Retrying PHP parsing with full content...');
                    try {
                        const gloriaResponse = convertPhpVarDumpToOta(content);
                        const { extractBranchesFromGloria } = await import("../../services/xmlParser.js");
                        branches = extractBranchesFromGloria(gloriaResponse);
                        console.warn(`[upload-branches] Retry extracted ${branches.length} branches`);
                    }
                    catch (retryError) {
                        console.error('[upload-branches] Retry parsing failed:', retryError);
                    }
                }
            }
        }
        // Allow upload even if no branches found (return 200 with empty result)
        // NEVER return 422 - always return 200 with detailed info
        if (branches.length === 0) {
            return res.status(200).json({
                message: "No branches found in uploaded data. Please check the data format.",
                imported: 0,
                updated: 0,
                skipped: 0,
                total: 0,
                summary: {
                    total: 0,
                    valid: 0,
                    invalid: 0,
                    imported: 0,
                    updated: 0,
                    skipped: 0,
                },
                error: "NO_BRANCHES",
                warnings: [
                    "No branches found in uploaded data.",
                    "Expected format: { CompanyCode: string, Branches: [...] } or array of branches, or PHP var_dump/XML with OTA_VehLocSearchRS structure.",
                    content ? `Content received (${content.length} chars) but could not extract branches. Please check the format matches the expected PHP var_dump structure.` : "No content was extracted from the request. Please ensure you're sending the data correctly."
                ],
            });
        }
        // Validate all branches - but allow upload even if validation fails (client requirement)
        // Use companyCode from authenticated user's company (automatically from source)
        // Convert null to undefined for validation (companyCode is optional)
        const { validateLocationArray } = await import("../../services/locationValidation.js");
        const validation = validateLocationArray(branches, companyCode);
        console.log(`[upload-branches] Validation result: valid=${validation.valid}, errors=${validation.errors.length}`);
        // Log validation errors but don't block upload (client wants to store data even if validation fails)
        if (validation.errors.length > 0) {
            console.warn(`[upload-branches] ${validation.errors.length} branch(es) have validation issues, but proceeding with upload as requested`);
        }
        // Upsert branches - extract all available fields, use null for missing ones
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        for (const branch of branches) {
            // Extract branch code - try multiple possible fields and nested structures
            let branchCode = branch.Branchcode ||
                branch.Code ||
                branch.attr?.Code ||
                branch.attr?.BranchType ||
                branch.LocationDetail?.attr?.Code ||
                branch.LocationDetail?.attr?.BranchType ||
                '';
            // Generate a branch code if missing (don't skip - user can fix later)
            if (!branchCode) {
                const nameForCode = branch.Name || branch.attr?.Name || branch.LocationDetail?.attr?.Name || 'BRANCH';
                branchCode = `${nameForCode}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_').substring(0, 50);
                console.warn(`[upload-branches] Generated branch code: ${branchCode}`);
            }
            // Extract all fields - use null if missing (user can fill later)
            const name = branch.Name || branch.attr?.Name || branch.LocationDetail?.attr?.Name || null;
            // Extract coordinates
            let latitude = null;
            let longitude = null;
            const latValue = branch.Latitude || branch.attr?.Latitude || branch.LocationDetail?.attr?.Latitude;
            const lonValue = branch.Longitude || branch.attr?.Longitude || branch.LocationDetail?.attr?.Longitude;
            if (latValue !== undefined && latValue !== null && latValue !== '') {
                const lat = typeof latValue === 'number' ? latValue : parseFloat(String(latValue));
                if (!isNaN(lat))
                    latitude = lat;
            }
            if (lonValue !== undefined && lonValue !== null && lonValue !== '') {
                const lon = typeof lonValue === 'number' ? lonValue : parseFloat(String(lonValue));
                if (!isNaN(lon))
                    longitude = lon;
            }
            // Extract AtAirport
            const atAirportValue = branch.AtAirport || branch.attr?.AtAirport || branch.LocationDetail?.attr?.AtAirport;
            const atAirport = atAirportValue === undefined || atAirportValue === null || atAirportValue === ''
                ? null
                : (atAirportValue === 'true' || atAirportValue === true ? 'true' : 'false');
            // Extract location and collection types
            const locationType = branch.LocationType || branch.attr?.LocationType || branch.LocationDetail?.attr?.LocationType || null;
            const collectionType = branch.CollectionType ||
                branch.attr?.CollectionType ||
                branch.LocationDetail?.attr?.CollectionType ||
                (atAirport === 'true' ? 'AIRPORT' : (atAirport === 'false' ? 'CITY' : null));
            // Extract phone and email
            const phone = branch.Telephone?.attr?.PhoneNumber || branch.Telephone?.PhoneNumber || null;
            const email = branch.EmailAddress || null;
            // Extract address components
            const addressLine = branch.Address?.AddressLine?.value || branch.Address?.AddressLine || null;
            const city = branch.Address?.CityName?.value || branch.Address?.CityName || null;
            const postalCode = branch.Address?.PostalCode?.value || branch.Address?.PostalCode || null;
            const country = branch.Address?.CountryName?.value || branch.Address?.CountryName || null;
            const countryCode = branch.Address?.CountryName?.attr?.Code || branch.Address?.CountryName?.Code || null;
            const branchData = {
                sourceId: source.id,
                branchCode: branchCode,
                name: name || null,
                status: branch.Status || 'ACTIVE',
                locationType: locationType || null,
                collectionType: collectionType || null,
                email: email || null,
                phone: phone || null,
                latitude: latitude || null,
                longitude: longitude || null,
                addressLine: addressLine || null,
                city: city || null,
                postalCode: postalCode || null,
                country: country || null,
                countryCode: countryCode || null,
                natoLocode: branch.NatoLocode || null,
                rawJson: branch,
            };
            const existing = await prisma.branch.findUnique({
                where: {
                    sourceId_branchCode: {
                        sourceId: source.id,
                        branchCode: branchCode, // Use the extracted branchCode, not branch.Branchcode
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
        // Always return 200 (success) even if validation fails - client wants to store data
        const message = validation.valid
            ? "Branches uploaded successfully"
            : `Branches uploaded successfully. ${validation.errors.length} branch(es) had validation issues but were still imported.`;
        // Enhance validation errors with detailed information
        const enhancedValidationErrors = validation.errors.map((err) => {
            const branch = branches[err.index];
            const errorDetails = err.error || {};
            const branchCode = branch?.Branchcode || branch?.Code || branch?.attr?.Code || 'UNKNOWN';
            const branchName = branch?.Name || branch?.attr?.Name || 'UNKNOWN';
            return {
                index: err.index,
                branchCode: branchCode,
                branchName: branchName,
                error: {
                    error: errorDetails.error || "Location validation failed",
                    fields: errorDetails.fields || [],
                    days: errorDetails.days,
                    details: errorDetails.details || {},
                },
            };
        });
        const response = {
            message,
            imported,
            updated,
            skipped,
            total: branches.length,
            summary: {
                total: branches.length,
                valid: branches.length - validation.errors.length,
                invalid: validation.errors.length,
                imported,
                updated,
                skipped,
            },
        };
        // Add validation errors if any
        if (validation.errors.length > 0) {
            response.validationErrors = enhancedValidationErrors;
            response.invalidDetails = enhancedValidationErrors;
            response.warnings = [
                `${validation.errors.length} branch(es) had validation issues but were still imported.`,
                'Check the validationErrors array for detailed information about what fields are missing or invalid.'
            ];
        }
        res.status(200).json(response);
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
/**
 * @openapi
 * /sources/import-locations:
 *   post:
 *     tags: [Sources]
 *     summary: Import locations from supplier endpoint (for own company)
 *     description: |
 *       Imports location/UN/LOCODE data from supplier HTTP endpoint.
 *       Supports JSON and XML formats. Creates/updates UNLocode entries and links them to source.
 *     security:
 *       - bearerAuth: []
 */
sourcesRouter.post("/sources/import-locations", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
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
                locationEndpointUrl: true,
                whitelistedDomains: true,
            },
        });
        if (!source) {
            return res.status(404).json({ error: "SOURCE_NOT_FOUND", message: "Source not found" });
        }
        if (source.approvalStatus !== "APPROVED") {
            return res.status(400).json({
                error: "NOT_APPROVED",
                message: "Source must be approved before importing locations",
            });
        }
        if (!source.emailVerified) {
            return res.status(400).json({
                error: "EMAIL_NOT_VERIFIED",
                message: "Source email must be verified",
            });
        }
        // Use configured locationEndpointUrl, or fallback to httpEndpoint
        const endpointUrl = source.locationEndpointUrl ||
            source.httpEndpoint ||
            `http://localhost:9090`;
        if (!endpointUrl) {
            return res.status(400).json({
                error: "ENDPOINT_NOT_CONFIGURED",
                message: "Source locationEndpointUrl or httpEndpoint must be configured",
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
        let finalEndpointUrl = endpointUrl.trim();
        if (!finalEndpointUrl.startsWith('http://') && !finalEndpointUrl.startsWith('https://')) {
            finalEndpointUrl = `http://${finalEndpointUrl}`;
        }
        try {
            const fetchResponse = await fetch(finalEndpointUrl, {
                method: "GET",
                headers: {
                    "Request-Type": "LocationRq",
                    "Content-Type": "application/json",
                },
                signal: controller.signal,
                timeout: 30000,
            });
            clearTimeout(timeoutId);
            if (!fetchResponse.ok) {
                return res.status(fetchResponse.status).json({
                    error: "SUPPLIER_ERROR",
                    message: `Supplier endpoint returned ${fetchResponse.status}`,
                });
            }
            // Get response text first to handle both JSON and XML formats
            let responseText = await fetchResponse.text();
            // Clean up response text - remove HTML tags if present
            if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
                console.log('[import-locations] Response appears to be HTML, attempting to extract text content');
                const preMatch = responseText.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
                if (preMatch) {
                    responseText = preMatch[1];
                }
                else {
                    responseText = responseText.replace(/<[^>]+>/g, '');
                }
            }
            let data;
            let locations = [];
            // Try to parse as JSON first
            try {
                data = JSON.parse(responseText);
                console.log('[import-locations] Successfully parsed as JSON');
            }
            catch (jsonError) {
                // If JSON parsing fails, try to parse as XML
                console.log('[import-locations] Response is not JSON, attempting XML parsing');
                try {
                    const { XMLParser } = await import('fast-xml-parser');
                    const xmlParser = new XMLParser({
                        ignoreAttributes: false,
                        attributeNamePrefix: '@_',
                        textNodeName: 'value',
                        parseAttributeValue: true,
                        trimValues: true,
                    });
                    data = xmlParser.parse(responseText);
                    console.log('[import-locations] Successfully parsed as XML');
                }
                catch (xmlError) {
                    return res.status(400).json({
                        error: "INVALID_RESPONSE_FORMAT",
                        message: `Failed to parse response: ${xmlError.message || String(xmlError)}. Expected JSON or XML format.`,
                    });
                }
            }
            // Extract locations from response
            // Expected formats:
            // 1. JSON: { Locations: [...] } or { items: [...] } or array
            // 2. XML: <Locations><Location>...</Location></Locations>
            if (Array.isArray(data)) {
                locations = data;
            }
            else if (data.Locations && Array.isArray(data.Locations)) {
                locations = data.Locations;
            }
            else if (data.items && Array.isArray(data.items)) {
                locations = data.items;
            }
            else if (data.Location && Array.isArray(data.Location)) {
                locations = data.Location;
            }
            else if (data.Location) {
                locations = [data.Location];
            }
            else {
                return res.status(400).json({
                    error: "INVALID_FORMAT",
                    message: "Response must contain Locations array or items array",
                });
            }
            console.log(`[import-locations] Extracted ${locations.length} locations`);
            let imported = 0;
            let updated = 0;
            let skipped = 0;
            const errors = [];
            // Process each location
            for (let i = 0; i < locations.length; i++) {
                const loc = locations[i];
                try {
                    // Extract location data - handle both object and nested structures
                    const unlocode = (loc.unlocode || loc.UnLocode || loc.code || loc.Code || '').toString().toUpperCase().trim();
                    const country = (loc.country || loc.Country || '').toString().trim();
                    const place = (loc.place || loc.Place || loc.name || loc.Name || '').toString().trim();
                    const iataCode = (loc.iataCode || loc.IataCode || loc.iata_code || loc.IATA || '').toString().trim() || null;
                    const latitude = loc.latitude || loc.Latitude ? parseFloat(String(loc.latitude || loc.Latitude)) : null;
                    const longitude = loc.longitude || loc.Longitude ? parseFloat(String(loc.longitude || loc.Longitude)) : null;
                    if (!unlocode) {
                        errors.push({
                            index: i,
                            error: "Missing unlocode field",
                        });
                        skipped++;
                        continue;
                    }
                    // Validate unlocode format (should be 5 characters: 2 letter country + 3 letter location)
                    if (unlocode.length < 4 || unlocode.length > 5) {
                        errors.push({
                            index: i,
                            unlocode,
                            error: `Invalid unlocode format: ${unlocode} (should be 4-5 characters)`,
                        });
                        skipped++;
                        continue;
                    }
                    // Extract country from unlocode if not provided
                    const finalCountry = country || unlocode.substring(0, 2).toUpperCase();
                    // Upsert UNLocode entry
                    const unlocodeEntry = await prisma.uNLocode.upsert({
                        where: { unlocode },
                        update: {
                            country: finalCountry,
                            place: place || unlocode,
                            iataCode: iataCode || null,
                            latitude: latitude && !isNaN(latitude) ? latitude : null,
                            longitude: longitude && !isNaN(longitude) ? longitude : null,
                        },
                        create: {
                            unlocode,
                            country: finalCountry,
                            place: place || unlocode,
                            iataCode: iataCode || null,
                            latitude: latitude && !isNaN(latitude) ? latitude : null,
                            longitude: longitude && !isNaN(longitude) ? longitude : null,
                        },
                    });
                    // Check if location is already linked to source
                    const existingSourceLocation = await prisma.sourceLocation.findUnique({
                        where: {
                            sourceId_unlocode: {
                                sourceId,
                                unlocode,
                            },
                        },
                    });
                    if (existingSourceLocation) {
                        updated++;
                    }
                    else {
                        // Link location to source
                        await prisma.sourceLocation.create({
                            data: {
                                sourceId,
                                unlocode,
                                isMock: false, // Imported locations are not mock
                            },
                        });
                        imported++;
                    }
                }
                catch (locError) {
                    console.error(`[import-locations] Error processing location ${i}:`, locError);
                    errors.push({
                        index: i,
                        error: locError.message || String(locError),
                    });
                    skipped++;
                }
            }
            // Update lastLocationSyncAt
            await prisma.company.update({
                where: { id: sourceId },
                data: { lastLocationSyncAt: new Date() },
            });
            res.json({
                message: "Locations imported successfully",
                imported,
                updated,
                skipped,
                total: locations.length,
                errors: errors.length > 0 ? errors : undefined,
            });
        }
        catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError' || fetchError.code === 'ETIMEDOUT') {
                return res.status(504).json({
                    error: "TIMEOUT",
                    message: `Supplier endpoint timeout after 30s: ${finalEndpointUrl || endpointUrl}`,
                });
            }
            // Handle fetch connection errors
            if (fetchError.message?.includes("fetch failed") || fetchError.code === "ECONNREFUSED" || fetchError.code === "ENOTFOUND") {
                return res.status(503).json({
                    error: "ENDPOINT_CONNECTION_ERROR",
                    message: `Cannot connect to supplier endpoint: ${finalEndpointUrl || endpointUrl}. Please ensure the source backend is running and accessible.`,
                    details: fetchError.message || fetchError.code,
                    hint: "The supplier HTTP endpoint may not be running or may be unreachable",
                });
            }
            throw fetchError;
        }
    }
    catch (error) {
        console.error('[import-locations] Error:', error);
        next(error);
    }
});
