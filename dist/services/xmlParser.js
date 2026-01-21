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
                    // Extract attributes and elements
                    const attrs = locationDetail['@_'] || {};
                    const code = attrs.Code || locationDetail['@_Code'] || locationDetail.Code || '';
                    const name = attrs.Name || locationDetail['@_Name'] || locationDetail.Name || '';
                    // Extract address
                    const address = locationDetail.Address || {};
                    const addressLine = address.AddressLine || {};
                    const cityName = address.CityName || {};
                    const postalCode = address.PostalCode || {};
                    const countryName = address.CountryName || {};
                    // Extract telephone
                    const telephone = locationDetail.Telephone || {};
                    const phoneNumber = telephone['@_PhoneNumber'] || telephone.PhoneNumber || telephone['@_']?.PhoneNumber;
                    // Extract coordinates
                    const latitude = parseFloat(attrs.Latitude ||
                        locationDetail['@_Latitude'] ||
                        locationDetail.Latitude?.value ||
                        locationDetail.Latitude ||
                        '0');
                    const longitude = parseFloat(attrs.Longitude ||
                        locationDetail['@_Longitude'] ||
                        locationDetail.Longitude?.value ||
                        locationDetail.Longitude ||
                        '0');
                    // Convert to branch format
                    const branch = {
                        Branchcode: code,
                        Name: name,
                        Status: attrs.Status || locationDetail['@_Status'] || locationDetail.Status,
                        LocationType: attrs.LocationType || locationDetail['@_LocationType'] || locationDetail.LocationType,
                        CollectionType: attrs.CollectionType || locationDetail['@_CollectionType'] || locationDetail.CollectionType,
                        EmailAddress: locationDetail.EmailAddress?.value || locationDetail.EmailAddress,
                        Telephone: phoneNumber ? {
                            attr: {
                                PhoneNumber: phoneNumber,
                            },
                        } : undefined,
                        Latitude: isNaN(latitude) ? undefined : latitude,
                        Longitude: isNaN(longitude) ? undefined : longitude,
                        AtAirport: attrs.AtAirport || locationDetail['@_AtAirport'] || locationDetail.AtAirport,
                        Address: {
                            AddressLine: {
                                value: addressLine.value || addressLine,
                            },
                            CityName: {
                                value: cityName.value || cityName,
                            },
                            PostalCode: {
                                value: postalCode.value || postalCode,
                            },
                            CountryName: {
                                value: countryName.value || countryName,
                                attr: {
                                    Code: countryName['@_Code'] || countryName.Code || countryName['@_']?.Code,
                                },
                            },
                        },
                        Opening: locationDetail.Opening,
                        PickupInstructions: locationDetail.PickupInstructions,
                        Cars: locationDetail.Cars,
                        NatoLocode: locationDetail.NatoLocode?.value || locationDetail.NatoLocode,
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
        if (locationDetail) {
            branches.push(locationDetail);
        }
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
