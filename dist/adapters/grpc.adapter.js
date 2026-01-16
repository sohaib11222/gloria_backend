// HTTP adapter implementation for connecting to external suppliers
import fetch from 'node-fetch';
import { buildOtaVehResRQ, convertToOtaBookingData } from '../services/otaXmlBuilder.js';
export class GrpcAdapter {
    config;
    constructor(config) {
        this.config = config;
    }
    async makeRequest(method, path, data, useXml = false) {
        // Note: GrpcAdapter is actually HTTP-based (despite the name)
        // It makes HTTP REST requests, so it needs http:// or https://
        // IMPORTANT: If endpoint starts with grpc://, this adapter should NOT be used!
        // The registry should route grpc:// endpoints to GrpcSourceAdapter instead.
        let endpoint = this.config.endpoint;
        // If endpoint has grpc:// prefix, this is wrong - should use GrpcSourceAdapter
        if (endpoint.startsWith('grpc://')) {
            throw new Error(`GrpcAdapter (HTTP-based) cannot handle grpc:// endpoint. Use GrpcSourceAdapter instead. Endpoint: ${endpoint}`);
        }
        // For HTTP-based adapter, ensure protocol is present
        if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
            // If endpoint is just host:port, assume http:// for HTTP-based adapter
            endpoint = `http://${endpoint}`;
            console.log(`[GrpcAdapter] Added http:// protocol to endpoint: ${endpoint}`);
        }
        const url = `${endpoint}${path}`;
        const headers = {
            'Content-Type': useXml ? 'application/xml' : 'application/json'
        };
        if (this.config.authHeader) {
            headers['Authorization'] = this.config.authHeader;
        }
        let body;
        if (data) {
            if (useXml && typeof data === 'string') {
                body = data;
            }
            else {
                body = JSON.stringify(data);
            }
        }
        console.log(`[GrpcAdapter] Making ${method} request:`, {
            url,
            hasBody: !!body,
            bodySize: body?.length || 0,
            headers: Object.keys(headers)
        });
        try {
            const response = await fetch(url, {
                method,
                body,
                headers,
                signal: AbortSignal.timeout(30000)
            });
            console.log(`[GrpcAdapter] Response status: ${response.status} ${response.statusText}`);
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error(`[GrpcAdapter] HTTP error ${response.status}:`, errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            // Try to parse as JSON first, fall back to text
            const contentType = response.headers.get('content-type') || '';
            console.log(`[GrpcAdapter] Response content-type: ${contentType}`);
            if (contentType.includes('application/json')) {
                const jsonData = await response.json();
                console.log(`[GrpcAdapter] Parsed JSON response:`, {
                    type: Array.isArray(jsonData) ? 'array' : typeof jsonData,
                    length: Array.isArray(jsonData) ? jsonData.length : 'N/A'
                });
                return jsonData;
            }
            else {
                const textData = await response.text();
                console.log(`[GrpcAdapter] Text response (${textData.length} chars)`);
                return textData;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;
            console.error(`[GrpcAdapter] HTTP Adapter error for ${method} ${url}:`, {
                error: errorMessage,
                stack: errorStack,
                endpoint: this.config.endpoint,
                finalUrl: url
            });
            throw error;
        }
    }
    async locations() {
        try {
            const response = await this.makeRequest('GET', '/locations');
            // Extract location codes from the response
            return response.map((loc) => loc.LocationCode || loc.unlocode || loc).filter(Boolean);
        }
        catch (error) {
            console.error('Failed to fetch locations:', error);
            return [];
        }
    }
    async availability(criteria) {
        try {
            // Convert internal criteria to OTA-style format
            const otaCriteria = {
                PickupLocation: criteria.pickup_unlocode,
                DropOffLocation: criteria.dropoff_unlocode,
                PickupDateTime: criteria.pickup_iso,
                DropOffDateTime: criteria.dropoff_iso,
                VehicleClass: criteria.vehicle_classes?.[0] || 'CDMR',
                DriverAge: criteria.driver_age,
                ResidencyCountry: criteria.residency_country
            };
            const url = `${this.config.endpoint}/availability`;
            console.log(`[GrpcAdapter] Making availability request to: ${url}`, {
                sourceId: this.config.sourceId,
                criteria: otaCriteria,
                endpoint: this.config.endpoint
            });
            const response = await this.makeRequest('POST', '/availability', otaCriteria);
            console.log(`[GrpcAdapter] Availability response:`, {
                sourceId: this.config.sourceId,
                responseType: Array.isArray(response) ? 'array' : typeof response,
                responseLength: Array.isArray(response) ? response.length : 'N/A',
                response: response
            });
            // Handle case where response is not an array
            if (!Array.isArray(response)) {
                console.warn(`[GrpcAdapter] Expected array response, got:`, typeof response, response);
                return [];
            }
            // Convert OTA response to internal format
            const offers = response.map((offer) => ({
                source_id: this.config.sourceId,
                agreement_ref: criteria.agreement_ref,
                vehicle_class: offer.VehicleClass || offer.vehicle_class,
                vehicle_make_model: offer.VehicleMakeModel || offer.vehicle_make_model,
                rate_plan_code: offer.RatePlanCode || offer.rate_plan_code,
                currency: offer.Currency || offer.currency,
                total_price: offer.TotalPrice || offer.TotalPrice || 0,
                supplier_offer_ref: offer.SupplierOfferRef || offer.supplier_offer_ref,
                availability_status: offer.AvailabilityStatus || offer.availability_status
            }));
            console.log(`[GrpcAdapter] Converted ${offers.length} offers for source ${this.config.sourceId}`);
            return offers;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            console.error(`[GrpcAdapter] Failed to fetch availability for source ${this.config.sourceId}:`, {
                error: errorMessage,
                stack: errorStack,
                endpoint: this.config.endpoint,
                criteria: {
                    pickup: criteria.pickup_unlocode,
                    dropoff: criteria.dropoff_unlocode,
                    agreement_ref: criteria.agreement_ref
                }
            });
            // Re-throw error so it can be handled upstream (don't silently return empty array)
            throw error;
        }
    }
    async bookingCreate(input) {
        try {
            // Check if we have full booking data and should use OTA XML
            const hasFullBookingData = !!(input.pickup_unlocode || input.pickup_iso ||
                input.vehicle_class || input.driver_age);
            const useOtaXml = this.config.useOtaXml && hasFullBookingData &&
                this.config.agentId;
            let response;
            if (useOtaXml) {
                // Generate OTA XML format
                // Use agent info from input if available, otherwise fall back to config
                const agentId = input.agent_id || this.config.agentId || '';
                const agentCompanyName = input.agent_company_name || this.config.agentCompanyName;
                const otaData = convertToOtaBookingData(input, agentId, agentCompanyName);
                const xmlPayload = buildOtaVehResRQ(otaData);
                response = await this.makeRequest('POST', '/booking/create', xmlPayload, true);
                // Parse XML response if needed (for now, expect JSON response even with XML request)
                if (typeof response === 'string') {
                    // TODO: Add XML parsing if source returns XML
                    // For now, try to parse as JSON
                    try {
                        response = JSON.parse(response);
                    }
                    catch (e) {
                        // If not JSON, return raw response
                    }
                }
            }
            else {
                // Use JSON format (backward compatible)
                const bookingData = {
                    AgreementRef: input.agreement_ref,
                    SupplierOfferRef: input.supplier_offer_ref,
                    AgentBookingRef: input.agent_booking_ref,
                    PickupLocation: input.pickup_unlocode,
                    DropOffLocation: input.dropoff_unlocode,
                    PickupDateTime: input.pickup_iso,
                    DropOffDateTime: input.dropoff_iso,
                    VehicleClass: input.vehicle_class,
                    DriverAge: input.driver_age,
                    ResidencyCountry: input.residency_country,
                    ...(input.customer_info && { CustomerInfo: input.customer_info }),
                    ...(input.payment_info && { PaymentInfo: input.payment_info })
                };
                response = await this.makeRequest('POST', '/booking/create', bookingData);
            }
            return {
                supplier_booking_ref: response.SupplierBookingRef || response.supplier_booking_ref,
                status: response.Status || response.status || 'REQUESTED',
                agreement_ref: response.AgreementRef || response.agreement_ref || input.agreement_ref,
                supplier_offer_ref: response.SupplierOfferRef || response.supplier_offer_ref
            };
        }
        catch (error) {
            console.error('Failed to create booking:', error);
            throw error;
        }
    }
    async bookingModify(input) {
        try {
            // REQUIRED: agreement_ref must be sent to source on every call
            const modifyData = {
                SupplierBookingRef: input.supplier_booking_ref,
                AgreementRef: input.agreement_ref
            };
            const response = await this.makeRequest('POST', '/booking/modify', modifyData);
            return {
                supplier_booking_ref: response.SupplierBookingRef,
                status: response.Status,
                agreement_ref: response.AgreementRef || input.agreement_ref,
                supplier_offer_ref: response.SupplierOfferRef
            };
        }
        catch (error) {
            console.error('Failed to modify booking:', error);
            throw error;
        }
    }
    async bookingCancel(ref, agreement_ref) {
        try {
            // REQUIRED: agreement_ref must be sent to source on every call
            const cancelData = {
                SupplierBookingRef: ref,
                AgreementRef: agreement_ref
            };
            const response = await this.makeRequest('POST', '/booking/cancel', cancelData);
            return {
                supplier_booking_ref: response.SupplierBookingRef,
                status: response.Status,
                agreement_ref: response.AgreementRef || agreement_ref,
                supplier_offer_ref: response.SupplierOfferRef
            };
        }
        catch (error) {
            console.error('Failed to cancel booking:', error);
            throw error;
        }
    }
    async bookingCheck(ref, agreement_ref) {
        try {
            // REQUIRED: agreement_ref must be sent to source on every call
            // For GET requests, include agreement_ref as query parameter or header
            const response = await this.makeRequest('GET', `/booking/check/${ref}?agreement_ref=${encodeURIComponent(agreement_ref)}`);
            return {
                supplier_booking_ref: response.SupplierBookingRef,
                status: response.Status,
                agreement_ref: response.AgreementRef || agreement_ref,
                supplier_offer_ref: response.SupplierOfferRef
            };
        }
        catch (error) {
            console.error('Failed to check booking:', error);
            throw error;
        }
    }
}
