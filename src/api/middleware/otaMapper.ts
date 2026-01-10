import { Request, Response, NextFunction } from 'express';

// OTA XML field mapping from internal names to OTA standard names (for responses)
const OTA_FIELD_MAPPING: Record<string, string> = {
  // Location fields
  pickup_location: 'PickupLocation',
  dropoff_location: 'DropOffLocation',
  pickup_unlocode: 'PickupLocation',
  dropoff_unlocode: 'DropOffLocation',
  
  // Vehicle fields
  vehicle_class: 'VehicleClass',
  vehicle_make_model: 'VehicleMakeModel',
  
  // Rate and pricing fields
  rate_plan_code: 'RatePlanCode',
  total_price: 'TotalPrice',
  currency: 'Currency',
  
  // Status fields
  availability_status: 'AvailabilityStatus',
  booking_status: 'BookingStatus',
  
  // Supplier fields
  supplier_name: 'SupplierName',
  supplier_id: 'SupplierId',
  supplier_booking_ref: 'SupplierBookingRef',
  supplier_offer_ref: 'SupplierOfferRef',
  
  // Agreement fields
  agreement_ref: 'AgreementRef',
  
  // Agent fields
  agent_booking_ref: 'AgentBookingRef',
  
  // Time fields
  pickup_iso: 'PickupDateTime',
  dropoff_iso: 'DropOffDateTime',
  created_at: 'CreatedAt',
  updated_at: 'UpdatedAt',
  
  // Driver fields
  driver_age: 'DriverAge',
  residency_country: 'ResidencyCountry',
  
  // Request/Response fields
  request_id: 'RequestId',
  expected_sources: 'ExpectedSources',
  recommended_poll_ms: 'RecommendedPollMs',
  last_seq: 'LastSeq',
  complete: 'Complete',
  
  // Health fields
  source_id: 'SourceId',
  slow_rate: 'SlowRate',
  sample_count: 'SampleCount',
  backoff_level: 'BackoffLevel',
  excluded_until: 'ExcludedUntil',
  healthy: 'Healthy'
};

// Reverse mapping from OTA names to internal names (for requests)
const REVERSE_OTA_MAPPING: Record<string, string> = Object.fromEntries(
  Object.entries(OTA_FIELD_MAPPING).map(([internal, ota]) => [ota, internal])
);

// Handle nested OTA structures (e.g., PickupLocation.LocationCode)
const OTA_NESTED_MAPPING: Record<string, { path: string[]; internal: string }> = {
  'PickupLocation': { path: ['PickupLocation', 'LocationCode'], internal: 'pickup_unlocode' },
  'ReturnLocation': { path: ['ReturnLocation', 'LocationCode'], internal: 'dropoff_unlocode' },
  'PickupDateTime': { path: ['PickupDateTime'], internal: 'pickup_iso' },
  'ReturnDateTime': { path: ['ReturnDateTime'], internal: 'dropoff_iso' },
};

/**
 * Recursively rename keys in an object based on the OTA mapping
 */
function renameKeys(obj: any, mapping: Record<string, string>): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => renameKeys(item, mapping));
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const newKey = mapping[key] || key;
      result[newKey] = renameKeys(value, mapping);
    }
    
    return result;
  }
  
  return obj;
}

/**
 * Transform OTA field names to internal names (for requests)
 */
function transformOtaToInternal(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => transformOtaToInternal(item));
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Check for nested OTA structures (e.g., PickupLocation.LocationCode)
      if (key === 'PickupLocation' && typeof value === 'object' && value !== null) {
        const locCode = (value as any).LocationCode || (value as any).locationCode;
        if (locCode) {
          result.pickup_unlocode = locCode;
        }
        // Also copy other PickupLocation fields if any
        Object.assign(result, transformOtaToInternal(value));
        continue;
      }
      
      if (key === 'ReturnLocation' && typeof value === 'object' && value !== null) {
        const locCode = (value as any).LocationCode || (value as any).locationCode;
        if (locCode) {
          result.dropoff_unlocode = locCode;
        }
        // Also copy other ReturnLocation fields if any
        Object.assign(result, transformOtaToInternal(value));
        continue;
      }
      
      // Check reverse mapping
      const internalKey = REVERSE_OTA_MAPPING[key] || key.toLowerCase().replace(/([A-Z])/g, '_$1').toLowerCase();
      result[internalKey] = transformOtaToInternal(value);
    }
    
    return result;
  }
  
  return obj;
}

/**
 * OTA naming mapper middleware
 * Transforms:
 * - Request: OTA field names → internal field names
 * - Response: internal field names → OTA field names
 */
export function otaMapper(req: Request, res: Response, next: NextFunction): void {
  // Transform request body from OTA names to internal names
  if (req.body && typeof req.body === 'object') {
    req.body = transformOtaToInternal(req.body);
  }
  
  // Transform query parameters if needed
  if (req.query && typeof req.query === 'object') {
    // Handle query params that might use OTA names
    const transformedQuery: any = {};
    for (const [key, value] of Object.entries(req.query)) {
      const internalKey = REVERSE_OTA_MAPPING[key] || key;
      transformedQuery[internalKey] = value;
    }
    req.query = transformedQuery;
  }
  
  // Store the original json method
  const originalJson = res.json.bind(res);
  
  // Override the json method to transform the response
  res.json = function(body: any) {
    // Transform the response body using OTA mapping
    const transformedBody = renameKeys(body, OTA_FIELD_MAPPING);
    
    // Call the original json method with transformed data
    return originalJson(transformedBody);
  };
  
  next();
}
