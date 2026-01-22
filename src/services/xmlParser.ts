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

export interface GloriaBranchLocation {
  Branchcode: string;
  Name: string;
  Status?: string;
  LocationType?: string;
  CollectionType?: string;
  EmailAddress?: string;
  Telephone?: {
    attr?: {
      PhoneNumber?: string;
    };
  };
  Latitude?: number;
  Longitude?: number;
  Address?: {
    AddressLine?: {
      value?: string;
    };
    CityName?: {
      value?: string;
    };
    PostalCode?: {
      value?: string;
    };
    CountryName?: {
      value?: string;
      attr?: {
        Code?: string;
      };
    };
  };
  NatoLocode?: string;
  AtAirport?: string;
  Opening?: {
    [key: string]: {
      attr?: {
        Open?: string;
      };
    };
  };
  PickupInstructions?: {
    attr?: {
      Pickup?: string;
    };
  };
  Cars?: {
    Code?: Array<{
      attr?: {
        Acrisscode?: string;
        Group?: string;
        Make?: string;
        Model?: string;
        Doors?: string;
        Seats?: string;
        DepositAmount?: string;
      };
    }>;
  };
}

export interface GloriaResponse {
  gloria?: {
    attr?: {
      xmlns?: string;
      "xmlns:xsi"?: string;
      "xsi:schemaLocation"?: string;
      TimeStamp?: string;
      Target?: string;
      Version?: string;
    };
    Success?: any;
    RentalBrand?: {
      value?: string;
    };
    VehMatchedLocs?: Array<{
      VehMatchedLoc?: {
        LocationDetail?: GloriaBranchLocation;
      };
    }>;
  };
  // Also support OTA_VehLocSearchRS for backward compatibility
  OTA_VehLocSearchRS?: {
    attr?: {
      xmlns?: string;
      "xmlns:xsi"?: string;
      "xsi:schemaLocation"?: string;
      TimeStamp?: string;
      Target?: string;
      Version?: string;
    };
    Success?: any;
    RentalBrand?: {
      value?: string;
    };
    VehMatchedLocs?: Array<{
      VehMatchedLoc?: {
        LocationDetail?: GloriaBranchLocation;
      };
    }>;
  };
}

/**
 * Parse XML string to Gloria format
 */
export function parseXMLToGloria(xmlString: string): GloriaResponse {
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
    let vehMatchedLocs: any[] = [];
    if (root.VehMatchedLocs) {
      if (Array.isArray(root.VehMatchedLocs.VehMatchedLoc)) {
        vehMatchedLocs = root.VehMatchedLocs.VehMatchedLoc;
      } else if (root.VehMatchedLocs.VehMatchedLoc) {
        vehMatchedLocs = [root.VehMatchedLocs.VehMatchedLoc];
      }
    }
    
    // Convert to Gloria format
    const result: GloriaResponse = {
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
        VehMatchedLocs: vehMatchedLocs.map((loc: any) => {
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
          const normalizedOpening: any = {};
          const dayMap: { [key: string]: string } = {
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
            const dayObj = dayData as any;
            let openTime = dayObj.attr?.Open || dayObj['@_Open'] || dayObj.Open || '';
            let closedTime = dayObj.attr?.Closed || dayObj['@_Closed'] || dayObj.Closed || '';
            
            // PHP format may have both times in Open field: ": 09:00 - 22:00 "
            // Parse this format: extract times from "09:00 - 22:00" or ": 09:00 - 22:00 "
            if (openTime && !closedTime && openTime.includes('-')) {
              // Split by " - " or " -" or "- "
              const timeMatch = openTime.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
              if (timeMatch) {
                openTime = timeMatch[1].trim(); // "09:00"
                closedTime = timeMatch[2].trim(); // "22:00"
              } else {
                // Try simpler split
                const parts = openTime.split(/\s*-\s*/);
                if (parts.length >= 2) {
                  openTime = parts[parts.length - 2].replace(/^:\s*/, '').trim(); // Remove leading colon
                  closedTime = parts[parts.length - 1].trim();
                }
              }
            }
            
            // Clean up times - remove leading colons and spaces, default closed time if missing
            openTime = openTime.replace(/^:\s*/, '').trim();
            closedTime = closedTime.replace(/^:\s*/, '').trim() || '24:00'; // Default closed time
            
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
          const branch: GloriaBranchLocation = {
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
  } catch (error: any) {
    throw new Error(`Failed to parse XML: ${error.message}`);
  }
}

/**
 * Extract branches from Gloria response
 * Normalizes both XML-parsed and PHP-parsed structures to consistent format
 */
export function extractBranchesFromGloria(gloriaResponse: GloriaResponse): GloriaBranchLocation[] {
  const branches: GloriaBranchLocation[] = [];
  
  // Check both gloria and OTA_VehLocSearchRS formats
  const root = gloriaResponse.gloria || gloriaResponse.OTA_VehLocSearchRS;
  
  if (!root) {
    return branches;
  }
  
  const vehMatchedLocs = root.VehMatchedLocs || [];
  
  console.log(`[extractBranchesFromGloria] Processing ${vehMatchedLocs.length} VehMatchedLocs`);
  
  for (let i = 0; i < vehMatchedLocs.length; i++) {
    const loc = vehMatchedLocs[i];
    console.log(`[extractBranchesFromGloria] Processing location ${i}, has VehMatchedLoc:`, !!loc.VehMatchedLoc);
    const locationDetail: any = loc.VehMatchedLoc?.LocationDetail;
    if (!locationDetail) {
      console.warn(`[extractBranchesFromGloria] Location ${i} missing LocationDetail, skipping`);
      console.warn(`[extractBranchesFromGloria] Location ${i} structure:`, JSON.stringify(loc, null, 2).substring(0, 500));
      continue;
    }
    console.log(`[extractBranchesFromGloria] Location ${i} has LocationDetail, keys:`, Object.keys(locationDetail));
    
    // Normalize the structure - handle both XML-parsed (already normalized) and PHP-parsed (needs normalization)
    // PHP structure has: { attr: { Code, Name, ... }, Address: {...}, ... }
    // XML structure has: { Branchcode, Name, Address: {...}, ... }
    
    // If it already has Branchcode, it's already normalized (from XML parser)
    if (locationDetail.Branchcode) {
      branches.push(locationDetail as GloriaBranchLocation);
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
    
    // Extract code - try Code first, then BranchType, then check direct properties
    // PHP structure has: LocationDetail.attr.Code = "DXBA02"
    let code = attrs.Code || attrs.BranchType || '';
    let name = attrs.Name || '';
    
    // Fallback: check if Code/Name are direct properties (not in attr)
    if (!code && (locationDetail as any).Code) {
      code = (locationDetail as any).Code;
      console.warn(`[extractBranchesFromGloria] Found Code as direct property:`, code);
    }
    if (!name && (locationDetail as any).Name) {
      name = (locationDetail as any).Name;
      console.warn(`[extractBranchesFromGloria] Found Name as direct property:`, name);
    }
    
    if (!code) {
      console.error(`[extractBranchesFromGloria] Missing branch code! Attrs:`, attrs);
      console.error(`[extractBranchesFromGloria] Full locationDetail keys:`, Object.keys(locationDetail));
      console.error(`[extractBranchesFromGloria] LocationDetail sample:`, JSON.stringify(locationDetail, null, 2).substring(0, 1000));
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
      // If still no code, use a generated one to allow import
      code = `BRANCH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.warn(`[extractBranchesFromGloria] Generated fallback code:`, code);
    }
    
    // Extract address - handle both object and string formats
    const address: any = locationDetail.Address || {};
    const addressLine: any = address.AddressLine || {};
    const cityName: any = address.CityName || {};
    const postalCode: any = address.PostalCode || {};
    const countryName: any = address.CountryName || {};
    
    // Extract telephone
    const telephone: any = locationDetail.Telephone || {};
    const phoneNumber = telephone.attr?.PhoneNumber || 
                       (telephone as any)['@_PhoneNumber'] || 
                       telephone.PhoneNumber || 
                       '';
    
    // Extract coordinates - ensure they're numbers
    // PHP format: attr.Latitude = "25.228005" (string)
    // Try multiple sources: attr, direct property, nested
    const latStr = attrs.Latitude || 
                   (locationDetail as any).Latitude || 
                   locationDetail.Latitude || 
                   '';
    const lonStr = attrs.Longitude || 
                   (locationDetail as any).Longitude || 
                   locationDetail.Longitude || 
                   '';
    let latitude = NaN;
    let longitude = NaN;
    
    if (latStr) {
      const lat = parseFloat(String(latStr));
      if (!isNaN(lat)) {
        latitude = lat;
      }
    }
    if (lonStr) {
      const lon = parseFloat(String(lonStr));
      if (!isNaN(lon)) {
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
    
    // Extract AtAirport - try multiple sources
    const atAirportValue = attrs.AtAirport || 
                          (locationDetail as any).AtAirport || 
                          locationDetail.AtAirport;
    const atAirport = typeof atAirportValue === 'boolean' 
      ? (atAirportValue ? 'true' : 'false')
      : (atAirportValue ? String(atAirportValue).toLowerCase() : 'false');
    
    // Extract LocationType - try multiple sources
    const locationType = attrs.LocationType || 
                        (locationDetail as any).LocationType || 
                        locationDetail.LocationType || 
                        '';
    
    // Extract CollectionType - derive if missing
    const collectionType = attrs.CollectionType || 
                          (locationDetail as any).CollectionType ||
                          locationDetail.CollectionType ||
                          (atAirport === 'true' ? 'AIRPORT' : 'CITY');
    
    // Extract Status
    const status = attrs.Status || locationDetail.Status || 'ACTIVE';
    
    // Extract EmailAddress - provide default if missing
    const emailAddress = (locationDetail.EmailAddress as any)?.value || 
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
    const opening: any = locationDetail.Opening || {};
    const normalizedOpening: any = {};
    const dayMap: { [key: string]: string } = {
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
      const dayObj = dayData as any;
      // Extract Open time - PHP format: ": 09:00 - 22:00 " (may have leading colon and spaces)
      // OR separate Open/Closed fields
      let openTime = dayObj.attr?.Open || dayObj['@_Open'] || dayObj.Open || '';
      let closedTime = dayObj.attr?.Closed || dayObj['@_Closed'] || dayObj.Closed || '';
      
      // PHP format may have both times in Open field: ": 09:00 - 22:00 "
      // Parse this format: extract times from "09:00 - 22:00" or ": 09:00 - 22:00 "
      if (openTime && !closedTime && openTime.includes('-')) {
        // Split by " - " or " -" or "- "
        const timeMatch = openTime.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        if (timeMatch) {
          openTime = timeMatch[1].trim(); // "09:00"
          closedTime = timeMatch[2].trim(); // "22:00"
        } else {
          // Try simpler split
          const parts = openTime.split(/\s*-\s*/);
          if (parts.length >= 2) {
            openTime = parts[parts.length - 2].replace(/^:\s*/, '').trim(); // Remove leading colon
            closedTime = parts[parts.length - 1].trim();
          }
        }
      }
      
      // Clean up times - remove leading colons and spaces
      openTime = openTime.replace(/^:\s*/, '').trim();
      closedTime = closedTime.replace(/^:\s*/, '').trim();
      
      // Clean up the time string - remove leading colon and spaces
      if (openTime) {
        openTime = openTime.replace(/^:\s*/, '').trim();
        // If it's a range like "09:00 - 22:00", extract both start and end times
        if (openTime.includes(' - ')) {
          const parts = openTime.split(' - ').map((p: string) => p.trim());
          openTime = parts[0] || '00:00';
          // Use the end time as Closed if not already set
          if (!closedTime && parts[1]) {
            closedTime = parts[1];
          }
        }
      }
      
      // Ensure we have valid times
      if (!openTime) openTime = '00:00';
      if (!closedTime) closedTime = '24:00';
      
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
    const countryCode = (countryName as any).attr?.Code || 
                       (countryName as any)['@_Code'] || 
                       (countryName as any).Code || 
                       '';
    
    // Build normalized branch - ensure ALL required fields are present
    // CRITICAL: All fields must be present and correctly formatted for validation
    // Ensure CollectionType is always set - derive from AtAirport if not provided
    const finalCollectionType = collectionType || (atAirport === 'true' ? 'AIRPORT' : 'CITY');
    
    // Ensure coordinates are numbers, not strings
    // Try to parse from latStr/lonStr if latitude/longitude are NaN
    let finalLatitude: number | undefined = undefined;
    let finalLongitude: number | undefined = undefined;
    
    if (!isNaN(latitude)) {
      finalLatitude = latitude;
    } else if (latStr) {
      const lat = parseFloat(String(latStr));
      if (!isNaN(lat)) {
        finalLatitude = lat;
      }
    }
    
    if (!isNaN(longitude)) {
      finalLongitude = longitude;
    } else if (lonStr) {
      const lon = parseFloat(String(lonStr));
      if (!isNaN(lon)) {
        finalLongitude = lon;
      }
    }
    
    const normalizedBranch: GloriaBranchLocation = {
      Branchcode: code || '',
      Name: name || '',
      Status: status || 'ACTIVE',
      LocationType: locationType || '',
      CollectionType: finalCollectionType,
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
      Latitude: finalLatitude,
      Longitude: finalLongitude,
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
      NatoLocode: (locationDetail.NatoLocode as any)?.value || locationDetail.NatoLocode || undefined,
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
export function validateXMLStructure(xmlString: string): { valid: boolean; error?: string } {
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
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}
