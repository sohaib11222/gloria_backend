import { z } from "zod";
/**
 * Validates UN/LOCODE format (5 characters: 2-letter country + 3-letter location)
 * Example: GBMAN, USNYC, FRPAR
 */
export function validateUnlocode(unlocode) {
    const unlocodeRegex = /^[A-Z]{2}[A-Z0-9]{3}$/;
    return unlocodeRegex.test(unlocode.toUpperCase());
}
/**
 * Validates ISO 8601 date format
 * Accepts: 2025-01-15T10:00:00Z or 2025-01-15T10:00:00.000Z
 */
export function validateIsoDate(dateString) {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    if (!isoDateRegex.test(dateString)) {
        return false;
    }
    // Also check if it's a valid date
    const date = new Date(dateString);
    return !isNaN(date.getTime());
}
/**
 * Validates ISO 4217 currency code (3 uppercase letters)
 * Example: USD, EUR, GBP
 */
export function validateCurrencyCode(currency) {
    const currencyRegex = /^[A-Z]{3}$/;
    return currencyRegex.test(currency.toUpperCase());
}
/**
 * Validates OTA vehicle class codes
 */
const VALID_VEHICLE_CLASSES = [
    'ECMN', // Economy
    'CDMR', // Compact
    'ICAR', // Intermediate
    'SCAR', // Standard
    'FCAR', // Full Size
    'PCAR', // Premium
    'LCAR', // Luxury
    'STAR', // Standard SUV
    'MVAR', // Mini Van
    'FFAR', // Full Size SUV
    'SFAR', // Standard SUV
    'IFAR', // Intermediate SUV
    'CFAR', // Compact SUV
];
export function validateVehicleClass(vehicleClass) {
    return VALID_VEHICLE_CLASSES.includes(vehicleClass.toUpperCase());
}
/**
 * Zod schema for UN/LOCODE validation
 */
export const unlocodeSchema = z.string().refine((val) => validateUnlocode(val), { message: "UN/LOCODE must be 5 characters: 2-letter country code + 3-letter location code (e.g., GBMAN, USNYC)" });
/**
 * Zod schema for ISO 8601 date validation
 */
export const isoDateSchema = z.string().refine((val) => validateIsoDate(val), { message: "Date must be in ISO 8601 format (e.g., 2025-01-15T10:00:00Z)" });
/**
 * Zod schema for currency code validation
 */
export const currencySchema = z.string().refine((val) => validateCurrencyCode(val), { message: "Currency must be a 3-letter ISO 4217 code (e.g., USD, EUR, GBP)" });
/**
 * Zod schema for vehicle class validation
 */
export const vehicleClassSchema = z.string().refine((val) => validateVehicleClass(val), { message: `Vehicle class must be one of: ${VALID_VEHICLE_CLASSES.join(', ')}` });
