import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
const PROTO_PATH = process.env.SOURCE_PROVIDER_PROTO_PATH || path.resolve(process.cwd(), "../protos/source_provider.proto");
function createClient(address) {
    const def = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });
    // @ts-ignore
    const { SourceProviderService } = grpc.loadPackageDefinition(def).source_provider;
    return new SourceProviderService(address, grpc.credentials.createInsecure());
}
export function makeGrpcSourceAdapter(address) {
    const client = createClient(address);
    return {
        async health() {
            return await new Promise((res, rej) => client.GetHealth({}, (e, r) => e ? rej(e) : res(r)));
        },
        async locations() {
            return await new Promise((res, rej) => client.GetLocations({}, (e, r) => e ? rej(e) : res(r)));
        },
        /**
         * Get availability - transforms internal format to source_provider.proto AvailabilityRequest
         * REQUIRED: agreement_ref must be included
         */
        async availability(criteria) {
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
            return await new Promise((res, rej) => client.GetAvailability(request, (e, r) => {
                if (e)
                    return rej(e);
                // Transform response to internal format (matching source_provider.proto VehicleOffer)
                const offers = (r.vehicles || []).map((v) => ({
                    source_id: criteria.source_id || "",
                    agreement_ref: criteria.agreement_ref,
                    vehicle_class: v.vehicle_class || "",
                    vehicle_make_model: v.make_model || "", // proto field is make_model
                    rate_plan_code: "", // Not in proto response, will be empty
                    currency: v.currency || "",
                    total_price: v.total_price || 0,
                    supplier_offer_ref: v.supplier_offer_ref || "",
                    availability_status: v.availability_status || "AVAILABLE",
                }));
                res(offers);
            }));
        },
        /**
         * Create booking - transforms to source_provider.proto BookingCreateRequest
         * REQUIRED: agreement_ref, supplier_offer_ref, idempotency_key
         */
        async bookingCreate(input) {
            // Transform to source_provider.proto BookingCreateRequest format
            // Include all available booking fields for full OTA compliance
            const request = {
                agreement_ref: input.agreement_ref || "",
                supplier_offer_ref: input.supplier_offer_ref || "",
                agent_booking_ref: input.agent_booking_ref || "",
                idempotency_key: input.idempotency_key || input.idempotencyKey || "",
            };
            // Add location details if available
            if (input.pickup_unlocode)
                request.pickup_unlocode = input.pickup_unlocode;
            if (input.dropoff_unlocode)
                request.dropoff_unlocode = input.dropoff_unlocode;
            if (input.pickup_iso)
                request.pickup_iso = input.pickup_iso;
            if (input.dropoff_iso)
                request.dropoff_iso = input.dropoff_iso;
            // Add vehicle and driver details if available
            if (input.vehicle_class)
                request.vehicle_class = input.vehicle_class;
            if (input.vehicle_make_model)
                request.vehicle_make_model = input.vehicle_make_model;
            if (input.rate_plan_code)
                request.rate_plan_code = input.rate_plan_code;
            if (input.driver_age !== undefined)
                request.driver_age = input.driver_age;
            if (input.residency_country)
                request.residency_country = input.residency_country;
            // Add customer and payment info if available
            if (input.customer_info)
                request.customer_info = input.customer_info;
            if (input.customer_info_json)
                request.customer_info_json = input.customer_info_json;
            if (input.payment_info)
                request.payment_info = input.payment_info;
            if (input.payment_info_json)
                request.payment_info_json = input.payment_info_json;
            return await new Promise((res, rej) => client.CreateBooking(request, (e, r) => {
                if (e)
                    return rej(e);
                // Transform response to internal format
                res({
                    supplier_booking_ref: r.supplier_booking_ref || "",
                    status: r.status || "REQUESTED",
                    agreement_ref: input.agreement_ref,
                    supplier_offer_ref: input.supplier_offer_ref,
                });
            }));
        },
        /**
         * Modify booking - REQUIRED: agreement_ref must be sent on every call
         * Transforms to source_provider.proto BookingRef format
         */
        async bookingModify(input) {
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
            return await new Promise((res, rej) => client.ModifyBooking(request, (e, r) => {
                if (e)
                    return rej(e);
                // Transform response to internal format
                res({
                    supplier_booking_ref: r.supplier_booking_ref || supplier_booking_ref,
                    status: r.status || "REQUESTED",
                    agreement_ref: agreement_ref,
                });
            }));
        },
        /**
         * Cancel booking - REQUIRED: agreement_ref must be sent on every call
         * Transforms to source_provider.proto BookingRef format
         */
        async bookingCancel(ref, agreement_ref) {
            if (!ref || !agreement_ref) {
                return Promise.reject(new Error("supplier_booking_ref and agreement_ref are required"));
            }
            // Transform to source_provider.proto BookingRef format
            const request = {
                agreement_ref: agreement_ref,
                supplier_booking_ref: ref,
            };
            return await new Promise((res, rej) => client.CancelBooking(request, (e, r) => {
                if (e)
                    return rej(e);
                // Transform response to internal format
                res({
                    supplier_booking_ref: r.supplier_booking_ref || ref,
                    status: r.status || "CANCELLED",
                    agreement_ref: agreement_ref,
                });
            }));
        },
        /**
         * Check booking - REQUIRED: agreement_ref must be sent on every call
         * Transforms to source_provider.proto BookingRef format
         */
        async bookingCheck(ref, agreement_ref) {
            if (!ref || !agreement_ref) {
                return Promise.reject(new Error("supplier_booking_ref and agreement_ref are required"));
            }
            // Transform to source_provider.proto BookingRef format
            const request = {
                agreement_ref: agreement_ref,
                supplier_booking_ref: ref,
            };
            return await new Promise((res, rej) => client.CheckBooking(request, (e, r) => {
                if (e)
                    return rej(e);
                // Transform response to internal format
                res({
                    supplier_booking_ref: r.supplier_booking_ref || ref,
                    status: r.status || "REQUESTED",
                    agreement_ref: agreement_ref,
                });
            }));
        }
    };
}
