// HTTP adapter implementation for connecting to external suppliers
import fetch from 'node-fetch';
import { buildOtaVehResRQ, convertToOtaBookingData } from '../services/otaXmlBuilder.js';
export class GrpcAdapter {
    config;
    constructor(config) {
        this.config = config;
    }
    async makeRequest(method, path, data, useXml = false) {
        const url = `${this.config.endpoint}${path}`;
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
        try {
            const response = await fetch(url, {
                method,
                body,
                headers,
                signal: AbortSignal.timeout(30000)
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            // Try to parse as JSON first, fall back to text
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                return await response.json();
            }
            else {
                return await response.text();
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`HTTP Adapter error for ${method} ${path}:`, errorMessage);
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
            const response = await this.makeRequest('POST', '/availability', otaCriteria);
            // Convert OTA response to internal format
            return response.map((offer) => ({
                source_id: this.config.sourceId,
                agreement_ref: criteria.agreement_ref,
                vehicle_class: offer.VehicleClass,
                vehicle_make_model: offer.VehicleMakeModel,
                rate_plan_code: offer.RatePlanCode,
                currency: offer.Currency,
                total_price: offer.TotalPrice,
                supplier_offer_ref: offer.SupplierOfferRef,
                availability_status: offer.AvailabilityStatus
            }));
        }
        catch (error) {
            console.error('Failed to fetch availability:', error);
            return [];
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
