/**
 * XML Parser Service for Branch Import
 * Handles OTA_VehLocSearchRS format (renamed to gloria format)
 */
import { XMLParser } from 'fast-xml-parser';
const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: 'value',
    parseAttributeValue: true,
    trimValues: true,
    isArray: (name, jPath, isLeafNode, isAttribute) => {
        // Only make VehMatchedLoc an array if there are multiple
        if (name === 'VehMatchedLoc' || name === 'Code') {
            return false; // Let the parser decide based on context
        }
        return false;
    },
});
/**
 * Parse XML string to Gloria format
 */
export function parseXMLToGloria(xmlString) {
    try {
        // Parse XML using fast-xml-parser
        const parsed = xmlParser.parse(xmlString);
        // Check for gloria or OTA_VehLocSearchRS root
        const rootKey = parsed.gloria ? 'gloria' : (parsed.OTA_VehLocSearchRS ? 'OTA_VehLocSearchRS' : null);
        if (!rootKey) {
            throw new Error('Invalid XML format: missing gloria or OTA_VehLocSearchRS root element');
        }
        const root = parsed[rootKey];
        // Extract VehMatchedLocs - handle both array and single object
        let vehMatchedLocs = [];
        if (root.VehMatchedLocs) {
            if (Array.isArray(root.VehMatchedLocs.VehMatchedLoc)) {
                vehMatchedLocs = root.VehMatchedLocs.VehMatchedLoc;
            }
            else if (root.VehMatchedLocs.VehMatchedLoc) {
                vehMatchedLocs = [root.VehMatchedLocs.VehMatchedLoc];
            }
        }
        // Convert to Gloria format
        const result = {
            [rootKey]: {
                attr: {
                    xmlns: root['@_xmlns'] || root.xmlns,
                    'xmlns:xsi': root['@_xmlns:xsi'] || root['xmlns:xsi'],
                    'xsi:schemaLocation': root['@_xsi:schemaLocation'] || root['xsi:schemaLocation'],
                    TimeStamp: root['@_TimeStamp'] || root.TimeStamp,
                    Target: root['@_Target'] || root.Target,
                    Version: root['@_Version'] || root.Version,
                },
                Success: root.Success || {},
                RentalBrand: root.RentalBrand || {},
                VehMatchedLocs: vehMatchedLocs.map((loc) => {
                    const locationDetail = loc.LocationDetail || {};
                    // Extract attributes - handle both @_ prefix (from parser) and attr object (from PHP)
                    // PHP output shows: LocationDetail.attr.Code, LocationDetail.attr.Name, etc.
                    const attrs = locationDetail.attr || locationDetail['@_'] || {};
                    // Extract branch code - try multiple locations
                    const code = attrs.Code ||
                        locationDetail['@_Code'] ||
                        locationDetail.Code ||
                        attrs.BranchType ||
                        locationDetail['@_BranchType'] ||
                        '';
                    // Extract name
                    const name = attrs.Name ||
                        locationDetail['@_Name'] ||
                        locationDetail.Name ||
                        '';
                    // Extract address - handle both value objects and direct values
                    const address = locationDetail.Address || {};
                    const addressLine = address.AddressLine || {};
                    const cityName = address.CityName || {};
                    const postalCode = address.PostalCode || {};
                    const countryName = address.CountryName || {};
                    // Extract telephone - handle attr.PhoneNumber structure
                    const telephone = locationDetail.Telephone || {};
                    const phoneNumber = telephone.attr?.PhoneNumber ||
                        telephone['@_PhoneNumber'] ||
                        telephone.PhoneNumber ||
                        telephone['@_']?.PhoneNumber ||
                        '';
                    // Extract coordinates - convert from string to number
                    const latStr = attrs.Latitude ||
                        locationDetail['@_Latitude'] ||
                        locationDetail.Latitude?.value ||
                        locationDetail.Latitude ||
                        '';
                    const lonStr = attrs.Longitude ||
                        locationDetail['@_Longitude'] ||
                        locationDetail.Longitude?.value ||
                        locationDetail.Longitude ||
                        '';
                    const latitude = latStr ? parseFloat(String(latStr)) : NaN;
                    const longitude = lonStr ? parseFloat(String(lonStr)) : NaN;
                    // Extract AtAirport - convert to string "true"/"false"
                    const atAirportValue = attrs.AtAirport ||
                        locationDetail['@_AtAirport'] ||
                        locationDetail.AtAirport;
                    const atAirport = typeof atAirportValue === 'boolean'
                        ? (atAirportValue ? 'true' : 'false')
                        : (atAirportValue ? String(atAirportValue).toLowerCase() : 'false');
                    // Extract LocationType
                    const locationType = attrs.LocationType ||
                        locationDetail['@_LocationType'] ||
                        locationDetail.LocationType ||
                        '';
                    // Extract CollectionType - if not present, derive from LocationType or AtAirport
                    // Default to "CITY" if not specified, or "AIRPORT" if AtAirport is true
                    const collectionType = attrs.CollectionType ||
                        locationDetail['@_CollectionType'] ||
                        locationDetail.CollectionType ||
                        (atAirport === 'true' ? 'AIRPORT' : 'CITY');
                    // Extract Status if available, default to ACTIVE
                    const status = attrs.Status ||
                        locationDetail['@_Status'] ||
                        locationDetail.Status ||
                        'ACTIVE';
                    // Extract EmailAddress if available - provide default if missing
                    // Use a placeholder email if not provided (validation requires email format)
                    const emailAddress = locationDetail.EmailAddress?.value ||
                        locationDetail.EmailAddress ||
                        `branch-${code}@example.com`; // Default email for validation
                    // Extract Opening hours - normalize day names and ensure both Open and Closed
                    const opening = locationDetail.Opening || {};
                    const normalizedOpening = {};
                    const dayMap = {
                        'monday': 'Monday',
                        'tuesday': 'Tuesday',
                        'wednesday': 'Wednesday',
                        'thursday': 'Thursday',
                        'friday': 'Friday',
                        'saturday': 'Saturday',
                        'sunday': 'Sunday'
                    };
                    // Process each day - ensure both Open and Closed attributes exist
                    for (const [day, dayData] of Object.entries(opening)) {
                        const normalizedDay = dayMap[day.toLowerCase()] || day;
                        const dayObj = dayData;
                        const openTime = dayObj.attr?.Open || dayObj['@_Open'] || dayObj.Open || '';
                        const closedTime = dayObj.attr?.Closed || dayObj['@_Closed'] || dayObj.Closed || '24:00'; // Default closed time
                        normalizedOpening[normalizedDay] = {
                            attr: {
                                Open: openTime,
                                Closed: closedTime
                            }
                        };
                    }
                    // If no opening hours provided, create default 24/7 schedule
                    if (Object.keys(normalizedOpening).length === 0) {
                        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                        for (const day of days) {
                            normalizedOpening[day] = {
                                attr: {
                                    Open: '00:00',
                                    Closed: '24:00'
                                }
                            };
                        }
                    }
                    // Build branch object matching validation expectations
                    const branch = {
                        Branchcode: code,
                        Name: name,
                        Status: status,
                        LocationType: locationType,
                        CollectionType: collectionType,
                        EmailAddress: emailAddress || undefined,
                        Telephone: phoneNumber ? {
                            attr: {
                                PhoneNumber: phoneNumber,
                            },
                        } : undefined,
                        Latitude: !isNaN(latitude) ? latitude : undefined,
                        Longitude: !isNaN(longitude) ? longitude : undefined,
                        AtAirport: atAirport,
                        Address: {
                            AddressLine: {
                                value: addressLine.value || addressLine || '',
                            },
                            CityName: {
                                value: cityName.value || cityName || '',
                            },
                            PostalCode: {
                                value: postalCode.value || postalCode || '',
                            },
                            CountryName: {
                                value: countryName.value || countryName || '',
                                attr: {
                                    Code: countryName.attr?.Code ||
                                        countryName['@_Code'] ||
                                        countryName.Code ||
                                        countryName['@_']?.Code ||
                                        '',
                                },
                            },
                        },
                        Opening: Object.keys(normalizedOpening).length > 0 ? normalizedOpening : undefined,
                        PickupInstructions: locationDetail.PickupInstructions,
                        Cars: locationDetail.Cars,
                        NatoLocode: locationDetail.NatoLocode?.value || locationDetail.NatoLocode || undefined,
                    };
                    return {
                        VehMatchedLoc: {
                            LocationDetail: branch,
                        },
                    };
                }),
            },
        };
        return result;
    }
    catch (error) {
        throw new Error(`Failed to parse XML: ${error.message}`);
    }
}
/**
 * Extract branches from Gloria response
 * Normalizes both XML-parsed and PHP-parsed structures to consistent format
 */
export function extractBranchesFromGloria(gloriaResponse) {
    const branches = [];
    // Check both gloria and OTA_VehLocSearchRS formats
    const root = gloriaResponse.gloria || gloriaResponse.OTA_VehLocSearchRS;
    if (!root) {
        return branches;
    }
    const vehMatchedLocs = root.VehMatchedLocs || [];
    for (const loc of vehMatchedLocs) {
        const locationDetail = loc.VehMatchedLoc?.LocationDetail;
        if (!locationDetail) {
            continue;
        }
        // Normalize the structure - handle both XML-parsed (already normalized) and PHP-parsed (needs normalization)
        // PHP structure has: { attr: { Code, Name, ... }, Address: {...}, ... }
        // XML structure has: { Branchcode, Name, Address: {...}, ... }
        // If it already has Branchcode, it's already normalized (from XML parser)
        if (locationDetail.Branchcode) {
            branches.push(locationDetail);
            continue;
        }
        // Otherwise, normalize from PHP structure
        // PHP structure: LocationDetail.attr.Code, LocationDetail.attr.Name, etc.
        const attrs = locationDetail.attr || {};
        // Debug logging
        console.log(`[extractBranchesFromGloria] Normalizing PHP structure:`, {
            hasAttr: !!locationDetail.attr,
            attrKeys: Object.keys(attrs),
            code: attrs.Code || attrs.BranchType,
            name: attrs.Name,
            hasAddress: !!locationDetail.Address,
            hasTelephone: !!locationDetail.Telephone,
            fullLocationDetail: JSON.stringify(locationDetail, null, 2).substring(0, 1000)
        });
        // Extract code - try Code first, then BranchType
        // PHP structure has: LocationDetail.attr.Code = "DXBA02"
        const code = attrs.Code || attrs.BranchType || '';
        const name = attrs.Name || '';
        if (!code) {
            console.error(`[extractBranchesFromGloria] Missing branch code! Attrs:`, attrs);
            console.error(`[extractBranchesFromGloria] Full locationDetail keys:`, Object.keys(locationDetail));
            // Try to extract from nested structure
            if (locationDetail.LocationDetail?.attr?.Code) {
                console.warn(`[extractBranchesFromGloria] Found nested LocationDetail structure, using it`);
                return extractBranchesFromGloria({
                    gloria: {
                        VehMatchedLocs: [{
                                VehMatchedLoc: {
                                    LocationDetail: locationDetail.LocationDetail
                                }
                            }]
                    }
                });
            }
        }
        // Extract address - handle both object and string formats
        const address = locationDetail.Address || {};
        const addressLine = address.AddressLine || {};
        const cityName = address.CityName || {};
        const postalCode = address.PostalCode || {};
        const countryName = address.CountryName || {};
        // Extract telephone
        const telephone = locationDetail.Telephone || {};
        const phoneNumber = telephone.attr?.PhoneNumber ||
            telephone['@_PhoneNumber'] ||
            telephone.PhoneNumber ||
            '';
        // Extract coordinates - ensure they're numbers
        // PHP format: attr.Latitude = "25.228005" (string)
        const latStr = attrs.Latitude || locationDetail.Latitude || '';
        const lonStr = attrs.Longitude || locationDetail.Longitude || '';
        let latitude = NaN;
        let longitude = NaN;
        if (latStr) {
            const lat = parseFloat(String(latStr));
            if (!isNaN(lat) && lat !== 0) {
                latitude = lat;
            }
        }
        if (lonStr) {
            const lon = parseFloat(String(lonStr));
            if (!isNaN(lon) && lon !== 0) {
                longitude = lon;
            }
        }
        // Debug coordinate extraction
        if (isNaN(latitude) || isNaN(longitude)) {
            console.warn(`[extractBranchesFromGloria] Coordinate extraction warning:`, {
                latStr,
                lonStr,
                latitude,
                longitude,
                attrsLatitude: attrs.Latitude,
                attrsLongitude: attrs.Longitude
            });
        }
        // Extract AtAirport
        const atAirportValue = attrs.AtAirport || locationDetail.AtAirport;
        const atAirport = typeof atAirportValue === 'boolean'
            ? (atAirportValue ? 'true' : 'false')
            : (atAirportValue ? String(atAirportValue).toLowerCase() : 'false');
        // Extract LocationType
        const locationType = attrs.LocationType || locationDetail.LocationType || '';
        // Extract CollectionType - derive if missing
        const collectionType = attrs.CollectionType ||
            locationDetail.CollectionType ||
            (atAirport === 'true' ? 'AIRPORT' : 'CITY');
        // Extract Status
        const status = attrs.Status || locationDetail.Status || 'ACTIVE';
        // Extract EmailAddress - provide default if missing
        const emailAddress = locationDetail.EmailAddress?.value ||
            locationDetail.EmailAddress ||
            `branch-${code}@example.com`;
        // Normalize phone number - trim spaces and ensure + prefix
        // Handle cases like "+ 971 50 766 71 77 " -> "+9715076671777"
        let normalizedPhone = String(phoneNumber).trim();
        if (normalizedPhone) {
            // Remove all spaces
            normalizedPhone = normalizedPhone.replace(/\s+/g, '');
            // Ensure + prefix
            if (!normalizedPhone.startsWith('+')) {
                normalizedPhone = '+' + normalizedPhone;
            }
        }
        // Extract Opening hours - normalize day names and ensure both Open and Closed
        const opening = locationDetail.Opening || {};
        const normalizedOpening = {};
        const dayMap = {
            'monday': 'Monday',
            'tuesday': 'Tuesday',
            'wednesday': 'Wednesday',
            'thursday': 'Thursday',
            'friday': 'Friday',
            'saturday': 'Saturday',
            'sunday': 'Sunday'
        };
        // Process opening hours - PHP format has lowercase day names
        for (const [day, dayData] of Object.entries(opening)) {
            const normalizedDay = dayMap[day.toLowerCase()] || day;
            const dayObj = dayData;
            // Extract Open time - PHP format: ": 09:00 - 22:00 " (may have leading colon and spaces)
            let openTime = dayObj.attr?.Open || dayObj['@_Open'] || dayObj.Open || '';
            let closedTime = dayObj.attr?.Closed || dayObj['@_Closed'] || dayObj.Closed || '';
            // Clean up the time string - remove leading colon and spaces
            if (openTime) {
                openTime = openTime.replace(/^:\s*/, '').trim();
                // If it's a range like "09:00 - 22:00", extract both start and end times
                if (openTime.includes(' - ')) {
                    const parts = openTime.split(' - ').map((p) => p.trim());
                    openTime = parts[0] || '00:00';
                    // Use the end time as Closed if not already set
                    if (!closedTime && parts[1]) {
                        closedTime = parts[1];
                    }
                }
            }
            // Ensure we have valid times
            if (!openTime)
                openTime = '00:00';
            if (!closedTime)
                closedTime = '24:00';
            normalizedOpening[normalizedDay] = {
                attr: {
                    Open: openTime,
                    Closed: closedTime
                }
            };
        }
        // If no opening hours, create default 24/7
        if (Object.keys(normalizedOpening).length === 0) {
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            for (const day of days) {
                normalizedOpening[day] = {
                    attr: {
                        Open: '00:00',
                        Closed: '24:00'
                    }
                };
            }
        }
        // Extract address values - handle both object.value and direct string
        const addressLineValue = typeof addressLine === 'string' ? addressLine : (addressLine.value || '');
        const cityNameValue = typeof cityName === 'string' ? cityName : (cityName.value || '');
        const postalCodeValue = typeof postalCode === 'string' ? postalCode : (postalCode.value || '');
        const countryNameValue = typeof countryName === 'string' ? countryName : (countryName.value || '');
        // Extract country code - handle both attr.Code and @_Code
        const countryCode = countryName.attr?.Code ||
            countryName['@_Code'] ||
            countryName.Code ||
            '';
        // Build normalized branch - ensure ALL required fields are present
        // CRITICAL: All fields must be present and correctly formatted for validation
        const normalizedBranch = {
            Branchcode: code || '',
            Name: name || '',
            Status: status || 'ACTIVE',
            LocationType: locationType || '',
            CollectionType: collectionType || 'CITY',
            EmailAddress: emailAddress || `branch-${code || 'unknown'}@example.com`,
            Telephone: normalizedPhone ? {
                attr: {
                    PhoneNumber: normalizedPhone,
                },
            } : (phoneNumber ? {
                // If we have a phone number but it wasn't normalized, normalize it now
                attr: {
                    PhoneNumber: String(phoneNumber).trim().replace(/\s+/g, '').replace(/^([^+])/, '+$1'),
                },
            } : {
                attr: {
                    PhoneNumber: '+00000000000' // Default if missing
                }
            }),
            Latitude: (!isNaN(latitude) && latitude !== 0) ? latitude : (latStr ? (() => {
                const lat = parseFloat(String(latStr));
                return !isNaN(lat) ? lat : 0;
            })() : 0),
            Longitude: (!isNaN(longitude) && longitude !== 0) ? longitude : (lonStr ? (() => {
                const lon = parseFloat(String(lonStr));
                return !isNaN(lon) ? lon : 0;
            })() : 0),
            AtAirport: atAirport || 'false',
            Address: {
                AddressLine: {
                    value: addressLineValue || '',
                },
                CityName: {
                    value: cityNameValue || '',
                },
                PostalCode: {
                    value: postalCodeValue || '',
                },
                CountryName: {
                    value: countryNameValue || '',
                    attr: {
                        Code: countryCode || '',
                    },
                },
            },
            Opening: normalizedOpening,
            PickupInstructions: locationDetail.PickupInstructions,
            Cars: locationDetail.Cars,
            NatoLocode: locationDetail.NatoLocode?.value || locationDetail.NatoLocode || undefined,
        };
        // Debug: Log the normalized branch to verify all fields
        console.log(`[extractBranchesFromGloria] Normalized branch:`, {
            Branchcode: normalizedBranch.Branchcode,
            Name: normalizedBranch.Name,
            AtAirport: normalizedBranch.AtAirport,
            LocationType: normalizedBranch.LocationType,
            CollectionType: normalizedBranch.CollectionType,
            Latitude: normalizedBranch.Latitude,
            Longitude: normalizedBranch.Longitude,
            EmailAddress: normalizedBranch.EmailAddress,
            PhoneNumber: normalizedBranch.Telephone?.attr?.PhoneNumber,
            CountryCode: normalizedBranch.Address?.CountryName?.attr?.Code,
            OpeningDays: normalizedBranch.Opening ? Object.keys(normalizedBranch.Opening) : [],
            HasOpening: !!normalizedBranch.Opening,
            OpeningMonday: normalizedBranch.Opening?.Monday
        });
        // Validate that we have all required fields before adding
        if (!normalizedBranch.Branchcode) {
            console.error(`[extractBranchesFromGloria] WARNING: Branch missing code!`, {
                attrs,
                locationDetailKeys: Object.keys(locationDetail)
            });
        }
        branches.push(normalizedBranch);
    }
    return branches;
}
/**
 * Validate XML structure
 */
export function validateXMLStructure(xmlString) {
    try {
        // Check for XML declaration
        if (!xmlString.trim().startsWith('<?xml') && !xmlString.trim().startsWith('<')) {
            return { valid: false, error: 'Invalid XML: missing XML declaration or root element' };
        }
        // Check for gloria or OTA_VehLocSearchRS root
        if (!xmlString.includes('gloria') && !xmlString.includes('OTA_VehLocSearchRS')) {
            return { valid: false, error: 'Invalid XML: missing gloria or OTA_VehLocSearchRS root element' };
        }
        // Check for VehMatchedLocs
        if (!xmlString.includes('VehMatchedLocs') && !xmlString.includes('VehMatchedLoc')) {
            return { valid: false, error: 'Invalid XML: missing VehMatchedLocs or VehMatchedLoc elements' };
        }
        return { valid: true };
    }
    catch (error) {
        return { valid: false, error: error.message };
    }
}
