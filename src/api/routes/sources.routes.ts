import { Router } from "express";
import { z } from "zod";
import fetch from "node-fetch";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";
import { parseXMLToGloria, extractBranchesFromGloria, validateXMLStructure } from "../../services/xmlParser.js";

/**
 * Convert PHP var_dump output to OTA/Gloria structure
 * This handles the case where PHP endpoints return var_dump() output instead of JSON/XML
 * The PHP var_dump shows an OTA_VehLocSearchRS structure that we need to convert
 * Client requested to use "gloria" format name, but we support both for compatibility
 */
function convertPhpVarDumpToOta(phpText: string): any {
  try {
    const result: any = {
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
      if (phpText[pos] === '{') braceCount++;
      if (phpText[pos] === '}') braceCount--;
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
    const locations: any[] = [];
    
    // Find all LocationDetail blocks by looking for the pattern
    // [index]=> array(1) { ["VehMatchedLoc"]=> array(1) { ["LocationDetail"]=> array(count) { ...content... } } }
    let searchPos = 0;
    
    while (true) {
      // Find next LocationDetail
      const locationDetailStart = vehMatchedLocsText.indexOf('["LocationDetail"]', searchPos);
      if (locationDetailStart === -1) break;
      
      // Find the array(count) after LocationDetail
      const arrayStart = vehMatchedLocsText.indexOf('array(', locationDetailStart);
      if (arrayStart === -1) break;
      
      // Find the opening brace
      const contentStart = vehMatchedLocsText.indexOf('{', arrayStart);
      if (contentStart === -1) break;
      
      // Find matching closing brace for this LocationDetail
      let detailBraceCount = 1;
      let detailPos = contentStart + 1;
      let detailEnd = -1;
      
      while (detailPos < vehMatchedLocsText.length && detailBraceCount > 0) {
        if (vehMatchedLocsText[detailPos] === '{') detailBraceCount++;
        if (vehMatchedLocsText[detailPos] === '}') detailBraceCount--;
        if (detailBraceCount === 0) {
          detailEnd = detailPos;
          break;
        }
        detailPos++;
      }
      
      if (detailEnd === -1) break;
      
      const locationText = vehMatchedLocsText.substring(contentStart + 1, detailEnd);
      const locationDetail = parsePhpLocationDetail(locationText);
      
      if (locationDetail) {
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
    } else {
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
  } catch (error: any) {
    throw new Error(`Failed to parse PHP var_dump: ${error.message || String(error)}`);
  }
}

/**
 * Parse PHP LocationDetail structure from var_dump
 * Extracts key fields needed for branch import
 * Handles nested PHP array structures and converts to expected format
 */
function parsePhpLocationDetail(locationText: string): any {
  const location: any = {
    attr: {}
  };
  
  // Extract attributes from ["attr"]=> array(8) { ... }
  const attrSectionMatch = locationText.match(/\["attr"\]\s*=>\s*array\(\d+\)\s*\{([\s\S]*?)\}\s*\}/);
  if (attrSectionMatch) {
    const attrSection = attrSectionMatch[1];
    // Match: ["Key"]=> string(length) "value"
    const attrRegex = /\["([^"]+)"\]\s*=>\s*string\((\d+)\)\s*"([^"]*)"/g;
    let attrMatch;
    
    while ((attrMatch = attrRegex.exec(attrSection)) !== null) {
      location.attr[attrMatch[1]] = attrMatch[3];
    }
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
        const carAttrs: any = {};
        
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
sourcesRouter.get("/sources/branches", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
  try {
    const sourceId = req.user.companyId;
    const status = req.query.status as string | undefined;
    const locationType = req.query.locationType as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const where: any = {
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
  } catch (e) {
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

sourcesRouter.post("/sources/branches", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
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
  } catch (e: any) {
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
sourcesRouter.get("/sources/branches/:id", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
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
  } catch (e) {
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

sourcesRouter.patch("/sources/branches/:id", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
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
  } catch (e: any) {
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
sourcesRouter.get("/sources/branch-endpoint", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
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
  } catch (e: any) {
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
sourcesRouter.put("/sources/branch-endpoint", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
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
    let validatedUrl: string;
    try {
      const url = new URL(branchEndpointUrl);
      validatedUrl = url.toString();
      console.log(`[Branch Endpoint] URL validation passed: ${validatedUrl}`);
    } catch {
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
  } catch (e: any) {
    console.error(`[Branch Endpoint] Error updating branch endpoint:`, e);
    next(e);
  }
});

sourcesRouter.get("/sources/branches/unmapped", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
  try {
    const sourceId = req.user.companyId;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const where: any = {
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
  } catch (e) {
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
sourcesRouter.post("/sources/import-branches", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
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
    const endpointUrl =
      source.branchEndpointUrl ||
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
    } catch (e: any) {
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
          "Accept": "application/json, application/xml, text/xml",
        },
        signal: controller.signal,
        timeout: 30000,
      } as any);

      clearTimeout(timeoutId);

      if (!fetchResponse.ok) {
        return res.status(fetchResponse.status).json({
          error: "SUPPLIER_ERROR",
          message: `Supplier endpoint returned ${fetchResponse.status}`,
        });
      }

      // Get response as text first to detect format
      const responseText = await fetchResponse.text();
      
      // Detect content type
      const contentType = fetchResponse.headers.get('content-type') || '';
      let data: any;
      let branches: any[] = [];

      // Check if response is PHP var_dump format
      if (responseText.trim().startsWith('array(') || responseText.includes('["OTA_VehLocSearchRS"]')) {
        // Parse PHP var_dump output - convert to OTA structure
        try {
          // The PHP var_dump shows OTA_VehLocSearchRS structure
          // We need to convert it to the expected format
          const phpArrayMatch = responseText.match(/\["OTA_VehLocSearchRS"\]\s*=>\s*array\(([\s\S]*)\)/);
          
          if (phpArrayMatch) {
            // Convert PHP array structure to JSON-like structure
            // The structure is: OTA_VehLocSearchRS -> VehMatchedLocs -> VehMatchedLoc -> LocationDetail
            const otaStructure = convertPhpVarDumpToOta(responseText);
            
            if (otaStructure && (otaStructure.OTA_VehLocSearchRS || otaStructure.gloria)) {
              // Use the existing XML parser logic by converting to the expected format
              // Support both OTA_VehLocSearchRS and "gloria" format names (client requested "gloria")
              const gloriaResponse = {
                OTA_VehLocSearchRS: otaStructure.OTA_VehLocSearchRS || otaStructure.gloria,
                gloria: otaStructure.gloria || otaStructure.OTA_VehLocSearchRS
              };
              branches = extractBranchesFromGloria(gloriaResponse as any);
              
              console.log(`[Branch Import] Parsed ${branches.length} branches from PHP var_dump format`);
              
              if (branches.length === 0) {
                console.warn(`[Branch Import] No branches extracted. OTA structure:`, {
                  hasOta: !!otaStructure.OTA_VehLocSearchRS,
                  hasGloria: !!otaStructure.gloria,
                  otaLocs: otaStructure.OTA_VehLocSearchRS?.VehMatchedLocs?.length || 0,
                  gloriaLocs: otaStructure.gloria?.VehMatchedLocs?.length || 0
                });
              }
            } else {
              return res.status(422).json({
                error: "INVALID_PHP_FORMAT",
                message: "Could not parse PHP var_dump format. Expected OTA_VehLocSearchRS structure.",
              });
            }
          } else {
            return res.status(422).json({
              error: "INVALID_PHP_FORMAT",
              message: "PHP var_dump format detected but could not extract OTA_VehLocSearchRS structure.",
            });
          }
        } catch (parseError: any) {
          return res.status(422).json({
            error: "PARSE_ERROR",
            message: "Failed to parse PHP var_dump format",
            details: parseError.message || String(parseError),
          });
        }
      } else if (contentType.includes('xml') || contentType.includes('text/xml') || responseText.trim().startsWith('<?xml') || responseText.trim().startsWith('<')) {
        // Parse XML response
        const xmlText = responseText;
        
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
      } else {
        // Parse JSON response
        try {
          data = JSON.parse(responseText);
          
          // Extract branches (assume data.Branches or data is array)
          const dataTyped = data as any;
          branches = Array.isArray(dataTyped.Branches) ? dataTyped.Branches : (Array.isArray(data) ? data : []);
        } catch (jsonError: any) {
          return res.status(422).json({
            error: "INVALID_JSON",
            message: "Response is not valid JSON, XML, or PHP var_dump format",
            details: jsonError.message || String(jsonError),
          });
        }
      }

      // Validate CompanyCode (only for JSON responses)
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const dataTyped = data as any;
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

      // Add CompanyCode to branches if missing (for PHP/XML formats that don't include it)
      // This is needed for validation but not stored in the database
      const branchesWithCompanyCode = branches.map((branch: any) => ({
        ...branch,
        CompanyCode: branch.CompanyCode || source.companyCode
      }));

      // Validate all branches - but don't fail completely, just track errors
      const { validateLocationArray } = await import("../../services/locationValidation.js");
      const validation = validateLocationArray(branchesWithCompanyCode, source.companyCode);

      // Separate valid and invalid branches
      const validBranches: any[] = [];
      const invalidBranches: Array<{ branch: any; error: any; index: number }> = [];
      
      for (let i = 0; i < branches.length; i++) {
        const branch = branches[i];
        const branchWithCode = branchesWithCompanyCode[i];
        const branchValidation = await import("../../services/locationValidation.js");
        const result = branchValidation.validateLocationPayload(branchWithCode, source.companyCode);
        
        if (result.valid) {
          validBranches.push(branch);
        } else {
          invalidBranches.push({
            branch: branch,
            error: result.error,
            index: i
          });
        }
      }

      // If no valid branches, return error with details
      if (validBranches.length === 0) {
        return res.status(422).json({
          error: "VALIDATION_FAILED",
          message: `All ${branches.length} branch(es) failed validation`,
          errors: validation.errors,
          summary: {
            total: branches.length,
            valid: 0,
            invalid: branches.length,
            invalidDetails: invalidBranches.map(ib => ({
              index: ib.index,
              branchCode: ib.branch.Branchcode || ib.branch.attr?.Code || ib.branch.Code || 'unknown',
              branchName: ib.branch.Name || ib.branch.attr?.Name || 'unknown',
              error: ib.error
            }))
          }
        });
      }

      // Upsert only valid branches
      let imported = 0;
      let updated = 0;
      const skipped: Array<{ branchCode: string; branchName: string; reason: string }> = [];

      for (const branch of validBranches) {
        // Handle both JSON and XML formats
        // Code can be in attr.Code (from PHP/XML) or Branchcode (from JSON)
        const branchCode = branch.Branchcode || branch.attr?.Code || branch.Code || branch.attr?.BranchType;
        const branchName = branch.Name || branch.attr?.Name;
        
        // Convert latitude/longitude from string to number if needed
        let latitude: number | null = null;
        if (typeof branch.Latitude === "number") {
          latitude = branch.Latitude;
        } else if (branch.attr?.Latitude) {
          const lat = parseFloat(branch.attr.Latitude);
          latitude = isNaN(lat) ? null : lat;
        } else if (branch.Latitude) {
          const lat = parseFloat(String(branch.Latitude));
          latitude = isNaN(lat) ? null : lat;
        }
        
        let longitude: number | null = null;
        if (typeof branch.Longitude === "number") {
          longitude = branch.Longitude;
        } else if (branch.attr?.Longitude) {
          const lon = parseFloat(branch.attr.Longitude);
          longitude = isNaN(lon) ? null : lon;
        } else if (branch.Longitude) {
          const lon = parseFloat(String(branch.Longitude));
          longitude = isNaN(lon) ? null : lon;
        }
        
        // Extract ACRISS codes from Cars array for vehicle filtering
        const acrissCodes: string[] = [];
        if (branch.Cars?.Code && Array.isArray(branch.Cars.Code)) {
          for (const car of branch.Cars.Code) {
            if (car.attr?.Acrisscode) {
              acrissCodes.push(car.attr.Acrisscode);
            }
          }
        }
        
        // Store opening times, pickup/dropoff times, and ACRISS codes in rawJson
        // These will be available for future filtering and comparison
        const enhancedBranch = {
          ...branch,
          _extracted: {
            acrissCodes: acrissCodes,
            openingTimes: branch.Opening || {},
            pickupInstructions: branch.PickupInstructions?.attr?.Pickup || null,
            // Future: pickupTimes and dropoffTimes will be added when available
          }
        };
        
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
          // Store full branch data including Cars (ACRISS codes), Opening times, etc.
          rawJson: enhancedBranch,
        };

        if (!branchCode) {
          skipped.push({
            branchCode: 'unknown',
            branchName: branchName || 'unknown',
            reason: 'Missing branch code'
          });
          console.warn(`[Branch Import] Skipping branch without code:`, {
            hasBranchcode: !!branch.Branchcode,
            hasAttrCode: !!branch.attr?.Code,
            hasCode: !!branch.Code,
            hasAttrBranchType: !!branch.attr?.BranchType
          });
          continue;
        }

        // Check if branch already exists - only update if it does, create if it doesn't
        const existing = await prisma.branch.findUnique({
          where: {
            sourceId_branchCode: {
              sourceId: source.id,
              branchCode: branchCode,
            },
          },
        });

        if (existing) {
          // Update existing branch
          await prisma.branch.update({
            where: { id: existing.id },
            data: branchData,
          });
          updated++;
          console.log(`[Branch Import] Updated existing branch: ${branchCode} (${branchName})`);
        } else {
          // Create new branch
          await prisma.branch.create({
            data: branchData,
          });
          imported++;
          console.log(`[Branch Import] Imported new branch: ${branchCode} (${branchName})`);
        }
      }

      // Prepare response with detailed results
      const importResponse: any = {
        message: "Branch import completed",
        summary: {
          total: branches.length,
          valid: validBranches.length,
          invalid: invalidBranches.length,
          imported,
          updated,
          skipped: skipped.length
        },
        imported,
        updated,
        total: branches.length,
      };

      // Include validation errors if any branches were invalid
      if (invalidBranches.length > 0) {
        importResponse.validationErrors = invalidBranches.map(ib => ({
          index: ib.index,
          branchCode: ib.branch.Branchcode || ib.branch.attr?.Code || ib.branch.Code || 'unknown',
          branchName: ib.branch.Name || ib.branch.attr?.Name || 'unknown',
          error: ib.error
        }));
        
        importResponse.message = `${validBranches.length} branch(es) imported successfully, ${invalidBranches.length} branch(es) skipped due to validation errors`;
      } else {
        importResponse.message = "All branches imported successfully";
      }

      // Include skipped branches if any
      if (skipped.length > 0) {
        importResponse.skipped = skipped;
      }

      res.json(importResponse);
    } catch (fetchError: any) {
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
  } catch (e) {
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
sourcesRouter.post("/sources/upload-branches", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
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
    let branches: any[] = [];
    let parsedData: any = data;

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
    } else if (format === 'json' && rawData) {
      // Parse JSON string
      try {
        parsedData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      } catch (e: any) {
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
      const dataTyped = parsedData as any;
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
      } else {
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
  } catch (e) {
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
sourcesRouter.get("/sources/branches/poll", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
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
        const branchFetchResponse = await fetch(source.branchEndpointUrl!, {
          method: "GET",
          headers: {
            "Request-Type": "LocationRq",
            "Accept": "application/json, application/xml, text/xml",
          },
          timeout: 10000,
        } as any);

        if (!branchFetchResponse.ok) {
          return;
        }

        const contentType = branchFetchResponse.headers.get('content-type') || '';
        let branches: any[] = [];

        if (contentType.includes('xml')) {
          const xmlText = await branchFetchResponse.text();
          const validation = validateXMLStructure(xmlText);
          if (validation.valid) {
            const gloriaResponse = parseXMLToGloria(xmlText);
            branches = extractBranchesFromGloria(gloriaResponse);
          }
        } else {
          const data = await branchFetchResponse.json();
          const dataTyped = data as any;
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
      } catch (error) {
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
  } catch (e) {
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
sourcesRouter.get("/sources/locations/search", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
  try {
    const query = String(req.query.query || "").trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
    const cursor = String(req.query.cursor || "");

    const where: any = query
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
  } catch (e) {
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

sourcesRouter.post("/sources/locations", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
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
  } catch (e) {
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
sourcesRouter.delete("/sources/locations/:unlocode", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
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
  } catch (e) {
    next(e);
  }
});

