import { Request, Response, NextFunction } from 'express';

// OTA XML field mapping from internal names to OTA standard names
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
 * OTA naming mapper middleware
 * Transforms internal field names to OTA XML standard names
 */
export function otaMapper(req: Request, res: Response, next: NextFunction): void {
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
