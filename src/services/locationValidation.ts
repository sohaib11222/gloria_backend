import { z } from "zod";

export interface LocationValidationError {
  error: string;
  fields?: string[];
  days?: string[];
}

export interface LocationValidationResult {
  valid: boolean;
  error?: LocationValidationError;
}

/**
 * Validate a single location/branch JSON payload
 * Matches PHP prototype validation rules
 */
export function validateLocationPayload(
  payload: any,
  companyCode?: string
): LocationValidationResult {
  const errors: string[] = [];
  const missingFields: string[] = [];
  const invalidDays: string[] = [];

  // Check CompanyCode if provided
  // Only validate CompanyCode if companyCode parameter is provided (for SOURCE companies)
  // For ADMIN users, companyCode will be undefined, so this check is skipped
  // Note: If companyCode is an empty string, we also skip validation (treat as optional)
  if (companyCode !== undefined && companyCode !== null && companyCode !== "" && payload.CompanyCode !== companyCode) {
    return {
      valid: false,
      error: {
        error: `CompanyCode mismatch: expected "${companyCode}", got "${payload.CompanyCode || 'missing'}"`,
        fields: ["CompanyCode"],
      },
    };
  }

  // Validate required top-level fields
  // Allow empty strings but not undefined/null
  if (payload.Branchcode === undefined || payload.Branchcode === null || payload.Branchcode === '') {
    missingFields.push("Branchcode");
  }
  if (payload.AtAirport === undefined || payload.AtAirport === null || payload.AtAirport === '') {
    missingFields.push("AtAirport");
  }
  if (payload.LocationType === undefined || payload.LocationType === null || payload.LocationType === '') {
    missingFields.push("LocationType");
  }
  // CollectionType can be derived from AtAirport, so only check if both are missing
  if (!payload.CollectionType && (!payload.AtAirport || payload.AtAirport === 'false')) {
    // If AtAirport is true, CollectionType should be AIRPORT (but we allow it to be missing if we can derive it)
    // Only mark as missing if we can't derive it
    if (payload.AtAirport !== 'true') {
      missingFields.push("CollectionType");
    }
  }
  if (payload.Name === undefined || payload.Name === null || payload.Name === '') {
    missingFields.push("Name");
  }

  // Validate coordinates - accept both number and string (will be parsed)
  // Allow 0 as a valid coordinate value (some locations may be at 0,0)
  const latValue = payload.Latitude;
  const lonValue = payload.Longitude;
  let latitude: number | undefined = undefined;
  let longitude: number | undefined = undefined;
  
  if (typeof latValue === 'number') {
    latitude = isNaN(latValue) ? undefined : latValue;
  } else if (latValue !== undefined && latValue !== null && latValue !== '') {
    const parsed = parseFloat(String(latValue));
    latitude = isNaN(parsed) ? undefined : parsed;
  }
  
  if (typeof lonValue === 'number') {
    longitude = isNaN(lonValue) ? undefined : lonValue;
  } else if (lonValue !== undefined && lonValue !== null && lonValue !== '') {
    const parsed = parseFloat(String(lonValue));
    longitude = isNaN(parsed) ? undefined : parsed;
  }
  
  if (latitude === undefined) {
    missingFields.push("Latitude");
  }
  if (longitude === undefined) {
    missingFields.push("Longitude");
  }

  // Validate email - more lenient for OTA format (defaults are provided)
  if (payload.EmailAddress) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.EmailAddress)) {
      // Only warn, don't fail - OTA format may have default emails
      console.warn(`[Validation] Invalid email format: ${payload.EmailAddress}, but allowing for OTA format`);
    }
  }
  // EmailAddress is optional - extractBranchesFromGloria provides defaults

  // Validate phone - more lenient for OTA format
  if (payload.Telephone?.attr?.PhoneNumber) {
    const phoneNumber = payload.Telephone.attr.PhoneNumber;
    // Normalize phone number - remove spaces and ensure + prefix
    const normalizedPhone = phoneNumber.replace(/\s+/g, '').replace(/^([^+])/, '+$1');
    const phoneRegex = /^\+[0-9]{10,15}$/;
    if (!phoneRegex.test(normalizedPhone)) {
      // Only warn, don't fail - OTA format may have default phones
      console.warn(`[Validation] Invalid phone format: ${phoneNumber}, but allowing for OTA format`);
    }
  }
  // PhoneNumber is optional - extractBranchesFromGloria provides defaults

  // Validate Address
  if (!payload.Address) {
    missingFields.push("Address");
  } else {
    if (!payload.Address.AddressLine?.value) {
      missingFields.push("Address.AddressLine.value");
    }
    if (!payload.Address.CityName?.value) {
      missingFields.push("Address.CityName.value");
    }
    if (!payload.Address.PostalCode?.value) {
      missingFields.push("Address.PostalCode.value");
    }
    if (!payload.Address.CountryName?.value) {
      missingFields.push("Address.CountryName.value");
    }
    if (!payload.Address.CountryName?.attr?.Code) {
      missingFields.push("Address.CountryName.attr.Code");
    }
  }

  // Validate Opening hours - more lenient for OTA format (defaults are provided)
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  if (payload.Opening) {
    for (const day of days) {
      const dayData = payload.Opening[day];
      if (dayData) {
        // If day exists, validate it has Open/Closed
        // Accept if either Open or Closed exists (PHP format may have combined times)
        const hasOpen = dayData.attr?.Open || dayData.Open;
        const hasClosed = dayData.attr?.Closed || dayData.Closed;
        // If Open contains both times (PHP format ": 09:00 - 22:00 "), that's also valid
        const openTime = String(hasOpen || '');
        const hasCombinedTimes = openTime.includes('-') && openTime.match(/\d{1,2}:\d{2}/);
        
        if (!hasOpen && !hasClosed && !hasCombinedTimes) {
          invalidDays.push(`${day}.attr.Open/Closed`);
        }
      }
      // Missing days are OK - extractBranchesFromGloria provides defaults
    }
  }
  // Opening is optional - extractBranchesFromGloria provides defaults for all days

  // Validate optional ReturnInstructions
  if (payload.ReturnInstructions && !payload.ReturnInstructions.attr?.Pickup) {
    errors.push("ReturnInstructions.attr.Pickup: Required if ReturnInstructions is present");
  }

  // Compile result with detailed error messages
  if (missingFields.length > 0 || errors.length > 0 || invalidDays.length > 0) {
    // Create detailed error message showing exactly what's missing
    const errorMessages: string[] = [];
    
    if (missingFields.length > 0) {
      errorMessages.push(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    if (errors.length > 0) {
      errorMessages.push(`Validation errors: ${errors.join('; ')}`);
    }
    
    if (invalidDays.length > 0) {
      errorMessages.push(`Invalid opening hours for: ${invalidDays.join(', ')}`);
    }
    
    return {
      valid: false,
      error: {
        error: errorMessages.join('. ') || "Location validation failed",
        fields: [...missingFields, ...errors],
        days: invalidDays.length > 0 ? invalidDays : undefined,
        details: {
          missingFields: missingFields.length > 0 ? missingFields : undefined,
          validationErrors: errors.length > 0 ? errors : undefined,
          invalidDays: invalidDays.length > 0 ? invalidDays : undefined,
        },
      },
    };
  }

  return { valid: true };
}

/**
 * Validate multiple locations (for branch import)
 */
export function validateLocationArray(
  locations: any[],
  companyCode?: string
): { valid: boolean; errors: Array<{ index: number; error: LocationValidationError }> } {
  const errors: Array<{ index: number; error: LocationValidationError }> = [];

  for (let i = 0; i < locations.length; i++) {
    const result = validateLocationPayload(locations[i], companyCode);
    if (!result.valid && result.error) {
      errors.push({ index: i, error: result.error });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

