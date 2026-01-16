import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolveProtoPath } from "../grpc/util/resolveProtoPath.js";

/**
 * Normalize address for gRPC client connection.
 * 0.0.0.0 is a bind address (listen on all interfaces) but not valid for client connections.
 * Convert it to localhost for local connections.
 */
function normalizeAddressForClient(address: string): string {
  // If address is 0.0.0.0:port, convert to localhost:port for client connection
  if (address.startsWith('0.0.0.0:')) {
    const port = address.split(':')[1];
    const normalized = `localhost:${port}`;
    console.log(`[GrpcSourceAdapter] 🔄 Normalizing address: ${address} → ${normalized} (0.0.0.0 is bind address, using localhost for client)`);
    return normalized;
  }
  return address;
}

function createClient(address: string) {
  const normalizedAddress = normalizeAddressForClient(address);
  console.log(`[GrpcSourceAdapter] 🔌 Creating gRPC client with address: ${normalizedAddress} (original: ${address})`);
  
  // Resolve proto file path
  const { path: protoPath, tried } = resolveProtoPath(
    "source_provider.proto",
    process.env.SOURCE_PROVIDER_PROTO_PATH
  );
  
  if (!protoPath) {
    const errorMsg = [
      "Unable to locate source_provider.proto.",
      "Set env SOURCE_PROVIDER_PROTO_PATH to the full file path, or place the file in one of:",
      "- <repo-root>/protos/source_provider.proto",
      "- <middleware-backend>/protos/source_provider.proto",
      `Tried: ${tried.join(" | ")}`
    ].join("\n");
    console.error(`[GrpcSourceAdapter] ❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  console.log(`[GrpcSourceAdapter] 📄 Using proto file: ${protoPath}`);
  
  const def = protoLoader.loadSync(protoPath, { 
    keepCase: true, 
    longs: String, 
    enums: String, 
    defaults: true, 
    oneofs: true 
  });
  // @ts-ignore
  const { SourceProviderService } = grpc.loadPackageDefinition(def).source_provider;
  return new SourceProviderService(normalizedAddress, grpc.credentials.createInsecure());
}

export function makeGrpcSourceAdapter(address: string) {
  console.log(`[GrpcSourceAdapter] 📍 Using exact endpoint as configured by source: ${address}`);
  const client = createClient(address);
  console.log(`[GrpcSourceAdapter] ✅ gRPC client created successfully`);
  
  return {
    async health() { 
      return await new Promise((res, rej) => 
        client.GetHealth({}, (e: any, r: any) => e ? rej(e) : res(r))
      ); 
    },
    
    async locations(): Promise<any> { 
      return await new Promise((res, rej) => 
        client.GetLocations({}, (e: any, r: any) => e ? rej(e) : res(r))
      ); 
    },
    
    /**
     * Get availability - transforms internal format to source_provider.proto AvailabilityRequest
     * REQUIRED: agreement_ref must be included
     */
    async availability(criteria: any) { 
      // Transform to source_provider.proto AvailabilityRequest format
      const request = {
        agreement_ref: criteria.agreement_ref || "",
        pickup_unlocode: criteria.pickup_unlocode || "",
        dropoff_unlocode: criteria.dropoff_unlocode || "",
        pickup_iso: criteria.pickup_iso || "",
        dropoff_iso: criteria.dropoff_iso || "",
        driver_age: criteria.driver_age || 0,
        residency_country: criteria.residency_country || "",
        vehicle_classes: criteria.vehicle_classes || [],
      };
      
      console.log(`[GrpcSourceAdapter] 🔌 Making gRPC GetAvailability call:`, {
        originalEndpoint: address,
        request
      });
      
      const callStartTime = Date.now();
      
      return await new Promise((res, rej) => 
        client.GetAvailability(request, (e: any, r: any) => {
          const callDuration = Date.now() - callStartTime;
          
          if (e) {
            console.error(`[GrpcSourceAdapter] ❌ gRPC GetAvailability error (${callDuration}ms):`, {
              error: e.message || e,
              code: e.code,
              details: e.details,
              address,
              request
            });
            return rej(e);
          }
          
          console.log(`[GrpcSourceAdapter] ✅ gRPC GetAvailability response (${callDuration}ms):`, {
            vehiclesCount: r.vehicles?.length || 0,
            hasVehicles: !!r.vehicles,
            vehicles: r.vehicles,
            fullResponse: r
          });
          
          // Transform response to internal format (matching source_provider.proto VehicleOffer)
          const offers = (r.vehicles || []).map((v: any, index: number) => {
            // Generate supplier_offer_ref if missing
            let supplier_offer_ref = v.supplier_offer_ref || "";
            if (!supplier_offer_ref) {
              // Generate a unique reference based on offer characteristics
              // Format: GEN-{agreement_ref}-{source_id_short}-{index}-{hash}
              const sourceIdShort = (criteria.source_id || "").substring(0, 8);
              const agreementRefShort = (criteria.agreement_ref || "").substring(0, 10);
              const offerHash = Buffer.from(
                `${criteria.agreement_ref}-${v.vehicle_class || ""}-${v.make_model || ""}-${v.total_price || 0}-${index}`
              ).toString('base64').substring(0, 8).replace(/[^A-Za-z0-9]/g, '');
              supplier_offer_ref = `GEN-${agreementRefShort}-${sourceIdShort}-${index}-${offerHash}`;
              
              console.log(`[GrpcSourceAdapter] 🔧 Generated supplier_offer_ref for offer ${index}:`, {
                original: v.supplier_offer_ref || "(missing)",
                generated: supplier_offer_ref,
                agreement_ref: criteria.agreement_ref,
                source_id: criteria.source_id
              });
            }
            
            return {
              source_id: criteria.source_id || "",
              agreement_ref: criteria.agreement_ref,
              vehicle_class: v.vehicle_class || "",
              vehicle_make_model: v.make_model || "", // proto field is make_model
              rate_plan_code: "", // Not in proto response, will be empty
              currency: v.currency || "",
              total_price: v.total_price || 0,
              supplier_offer_ref: supplier_offer_ref,
              availability_status: v.availability_status || "AVAILABLE",
            };
          });
          
          console.log(`[GrpcSourceAdapter] 📦 Transformed ${offers.length} offers from gRPC response`);
          res(offers);
        })
      ); 
    },
    
    /**
     * Create booking - transforms to source_provider.proto BookingCreateRequest
     * REQUIRED: agreement_ref, supplier_offer_ref, idempotency_key
     */
    async bookingCreate(input: any) { 
      // Validate required fields before making gRPC call
      if (!input.agreement_ref) {
        throw new Error("agreement_ref is required");
      }
      if (!input.supplier_offer_ref) {
        throw new Error("supplier_offer_ref is required");
      }
      if (!input.idempotency_key && !input.idempotencyKey) {
        throw new Error("idempotency_key is required");
      }
      
      // Check if supplier_offer_ref is generated (starts with "GEN-")
      const isGeneratedRef = input.supplier_offer_ref?.startsWith("GEN-");
      
      console.log(`[GrpcSourceAdapter] 📋 Creating booking with validated fields:`, {
        agreement_ref: input.agreement_ref,
        supplier_offer_ref: input.supplier_offer_ref,
        idempotency_key: input.idempotency_key || input.idempotencyKey,
        hasAllRequired: true,
        isGeneratedRef: isGeneratedRef,
        note: isGeneratedRef ? "Using generated supplier_offer_ref (source did not provide one)" : "Using source-provided supplier_offer_ref"
      });
      
      // Transform to source_provider.proto BookingCreateRequest format
      // Include all available booking fields for full OTA compliance
      const request: any = {
        agreement_ref: input.agreement_ref,
        supplier_offer_ref: input.supplier_offer_ref,
        agent_booking_ref: input.agent_booking_ref || "",
        idempotency_key: input.idempotency_key || input.idempotencyKey,
      };
      
      console.log(`[GrpcSourceAdapter] 📤 Sending CreateBooking request to source backend:`, {
        agreement_ref: request.agreement_ref,
        supplier_offer_ref: request.supplier_offer_ref,
        idempotency_key: request.idempotency_key ? `${request.idempotency_key.substring(0, 20)}...` : 'MISSING',
        hasIdempotencyKey: !!request.idempotency_key,
        requestKeys: Object.keys(request),
        fullRequest: request
      });
      
      // Add location details if available
      if (input.pickup_unlocode) request.pickup_unlocode = input.pickup_unlocode;
      if (input.dropoff_unlocode) request.dropoff_unlocode = input.dropoff_unlocode;
      if (input.pickup_iso) request.pickup_iso = input.pickup_iso;
      if (input.dropoff_iso) request.dropoff_iso = input.dropoff_iso;
      
      // Add vehicle and driver details if available
      if (input.vehicle_class) request.vehicle_class = input.vehicle_class;
      if (input.vehicle_make_model) request.vehicle_make_model = input.vehicle_make_model;
      if (input.rate_plan_code) request.rate_plan_code = input.rate_plan_code;
      if (input.driver_age !== undefined) request.driver_age = input.driver_age;
      if (input.residency_country) request.residency_country = input.residency_country;
      
      // Add customer and payment info if available
      if (input.customer_info) request.customer_info = input.customer_info;
      if (input.customer_info_json) request.customer_info_json = input.customer_info_json;
      if (input.payment_info) request.payment_info = input.payment_info;
      if (input.payment_info_json) request.payment_info_json = input.payment_info_json;
      
      return await new Promise((res, rej) => 
        client.CreateBooking(request, (e: any, r: any) => {
          if (e) {
            console.error(`[GrpcSourceAdapter] ❌ Source backend CreateBooking error:`, {
              code: e.code,
              message: e.message,
              details: e.details,
              request: {
                agreement_ref: request.agreement_ref,
                supplier_offer_ref: request.supplier_offer_ref,
                idempotency_key: request.idempotency_key ? `${request.idempotency_key.substring(0, 20)}...` : 'MISSING'
              }
            });
            return rej(e);
          }
          console.log(`[GrpcSourceAdapter] ✅ Source backend CreateBooking success:`, {
            supplier_booking_ref: r.supplier_booking_ref,
            status: r.status
          });
          // Transform response to internal format
          res({
            supplier_booking_ref: r.supplier_booking_ref || "",
            status: r.status || "REQUESTED",
            agreement_ref: input.agreement_ref,
            supplier_offer_ref: input.supplier_offer_ref,
          });
        })
      ); 
    },
    
    /**
     * Modify booking - REQUIRED: agreement_ref must be sent on every call
     * Transforms to source_provider.proto BookingRef format
     */
    async bookingModify(input: any) { 
      // Handle both { supplier_booking_ref, agreement_ref } and separate params
      const supplier_booking_ref = input.supplier_booking_ref || input.ref || "";
      const agreement_ref = input.agreement_ref || "";
      
      if (!supplier_booking_ref || !agreement_ref) {
        return Promise.reject(new Error("supplier_booking_ref and agreement_ref are required"));
      }
      
      // Transform to source_provider.proto BookingRef format
      const request = {
        agreement_ref: agreement_ref,
        supplier_booking_ref: supplier_booking_ref,
      };
      
      return await new Promise((res, rej) => 
        client.ModifyBooking(request, (e: any, r: any) => {
          if (e) return rej(e);
          // Transform response to internal format
          res({
            supplier_booking_ref: r.supplier_booking_ref || supplier_booking_ref,
            status: r.status || "REQUESTED",
            agreement_ref: agreement_ref,
          });
        })
      ); 
    },
    
    /**
     * Cancel booking - REQUIRED: agreement_ref must be sent on every call
     * Transforms to source_provider.proto BookingRef format
     */
    async bookingCancel(ref: string, agreement_ref: string) { 
      if (!ref || !agreement_ref) {
        return Promise.reject(new Error("supplier_booking_ref and agreement_ref are required"));
      }
      
      // Transform to source_provider.proto BookingRef format
      const request = {
        agreement_ref: agreement_ref,
        supplier_booking_ref: ref,
      };
      
      return await new Promise((res, rej) => 
        client.CancelBooking(request, (e: any, r: any) => {
          if (e) return rej(e);
          // Transform response to internal format
          res({
            supplier_booking_ref: r.supplier_booking_ref || ref,
            status: r.status || "CANCELLED",
            agreement_ref: agreement_ref,
          });
        })
      ); 
    },
    
    /**
     * Check booking - REQUIRED: agreement_ref must be sent on every call
     * Transforms to source_provider.proto BookingRef format
     */
    async bookingCheck(ref: string, agreement_ref: string) { 
      if (!ref || !agreement_ref) {
        return Promise.reject(new Error("supplier_booking_ref and agreement_ref are required"));
      }
      
      // Transform to source_provider.proto BookingRef format
      const request = {
        agreement_ref: agreement_ref,
        supplier_booking_ref: ref,
      };
      
      return await new Promise((res, rej) => 
        client.CheckBooking(request, (e: any, r: any) => {
          if (e) return rej(e);
          // Transform response to internal format
          res({
            supplier_booking_ref: r.supplier_booking_ref || ref,
            status: r.status || "REQUESTED",
            agreement_ref: agreement_ref,
          });
        })
      ); 
    }
  };
}
