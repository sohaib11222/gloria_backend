/**
 * Validate a single location/branch JSON payload
 * Matches PHP prototype validation rules
 */
export function validateLocationPayload(payload, companyCode) {
    const errors = [];
    const missingFields = [];
    const invalidDays = [];
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
    if (!payload.Branchcode)
        missingFields.push("Branchcode");
    if (!payload.AtAirport)
        missingFields.push("AtAirport");
    if (!payload.LocationType)
        missingFields.push("LocationType");
    if (!payload.CollectionType)
        missingFields.push("CollectionType");
    if (!payload.Name)
        missingFields.push("Name");
    // Validate coordinates
    if (typeof payload.Latitude !== "number" || isNaN(payload.Latitude)) {
        missingFields.push("Latitude");
    }
    if (typeof payload.Longitude !== "number" || isNaN(payload.Longitude)) {
        missingFields.push("Longitude");
    }
    // Validate email
    if (!payload.EmailAddress) {
        missingFields.push("EmailAddress");
    }
    else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(payload.EmailAddress)) {
            errors.push("EmailAddress: Invalid email format");
        }
    }
    // Validate phone
    if (!payload.Telephone?.attr?.PhoneNumber) {
        missingFields.push("Telephone.attr.PhoneNumber");
    }
    else {
        const phoneRegex = /^\+[0-9]{10,15}$/;
        if (!phoneRegex.test(payload.Telephone.attr.PhoneNumber)) {
            errors.push("Telephone.attr.PhoneNumber: Must match pattern ^\\+[0-9]{10,15}$");
        }
    }
    // Validate Address
    if (!payload.Address) {
        missingFields.push("Address");
    }
    else {
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
    // Validate Opening hours (all 7 days required)
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    if (!payload.Opening) {
        missingFields.push("Opening");
    }
    else {
        for (const day of days) {
            const dayData = payload.Opening[day];
            if (!dayData) {
                invalidDays.push(day);
            }
            else {
                if (!dayData.attr?.Open) {
                    invalidDays.push(`${day}.attr.Open`);
                }
                if (!dayData.attr?.Closed) {
                    invalidDays.push(`${day}.attr.Closed`);
                }
            }
        }
    }
    // Validate optional ReturnInstructions
    if (payload.ReturnInstructions && !payload.ReturnInstructions.attr?.Pickup) {
        errors.push("ReturnInstructions.attr.Pickup: Required if ReturnInstructions is present");
    }
    // Compile result
    if (missingFields.length > 0 || errors.length > 0 || invalidDays.length > 0) {
        return {
            valid: false,
            error: {
                error: "Location validation failed",
                fields: [...missingFields, ...errors],
                days: invalidDays.length > 0 ? invalidDays : undefined,
            },
        };
    }
    return { valid: true };
}
/**
 * Validate multiple locations (for branch import)
 */
export function validateLocationArray(locations, companyCode) {
    const errors = [];
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
