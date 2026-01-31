// HTTP adapter implementation for connecting to external suppliers
import fetch from 'node-fetch';
import { buildOtaVehResRQ, buildOtaVehAvailRateRQ, convertToOtaBookingData } from '../services/otaXmlBuilder.js';
/**
 * Detect if response is OTA VehAvailRS-shaped (VehAvailRSCore with VehVendorAvails).
 */
export function isOtaVehAvailResponse(response) {
    if (!response || typeof response !== 'object')
        return false;
    const core = response.VehAvailRSCore;
    if (!core || typeof core !== 'object')
        return false;
    const vendorAvails = core.VehVendorAvails;
    return !!(vendorAvails && typeof vendorAvails === 'object');
}
/**
 * Normalize to array (PHP/JSON may return single object or array).
 */
function asArray(v) {
    if (v == null)
        return [];
    return Array.isArray(v) ? v : [v];
}
/**
 * Extract @attributes from OTA node (may be nested under @attributes key).
 */
function attrs(node) {
    if (!node || typeof node !== 'object')
        return {};
    const a = node['@attributes'];
    return (a && typeof a === 'object') ? a : {};
}
/**
 * Parse OTA VehAvailRS response into internal Offer[] with rich fields.
 */
export function parseOtaVehAvailResponse(response, sourceId, criteria) {
    const core = response.VehAvailRSCore;
    if (!core)
        return [];
    const vehRentalCore = core.VehRentalCore || {};
    const pickupLoc = vehRentalCore.PickUpLocation;
    const returnLoc = vehRentalCore.ReturnLocation;
    const pickupAttrs = attrs(pickupLoc);
    const returnAttrs = attrs(returnLoc);
    const pickup_location_details = (pickupAttrs.LocationCode || pickupAttrs.Locationname) ? {
        LocationCode: pickupAttrs.LocationCode,
        locationname: pickupAttrs.Locationname,
        locationaddress: pickupAttrs.Locationaddress,
        locationcity: pickupAttrs.Locationcity,
        locationpostcode: pickupAttrs.Locationpostcode,
        locationtele: pickupAttrs.Locationtele,
        emailaddress: pickupAttrs.emailaddress,
        locationlong: pickupAttrs.Locationlong,
        locationlat: pickupAttrs.Locationlat,
    } : undefined;
    const return_location_details = (returnAttrs.LocationCode || returnAttrs.Locationname) ? {
        LocationCode: returnAttrs.LocationCode,
        locationname: returnAttrs.Locationname,
        locationaddress: returnAttrs.Locationaddress,
        locationcity: returnAttrs.Locationcity,
        locationpostcode: returnAttrs.Locationpostcode,
        locationtele: returnAttrs.Locationtele,
        emailaddress: returnAttrs.emailaddress,
        locationlong: returnAttrs.Locationlong,
        locationlat: returnAttrs.Locationlat,
    } : undefined;
    const vendorAvails = core.VehVendorAvails;
    const vendorAvailList = asArray(vendorAvails?.VehVendorAvail ?? vendorAvails);
    const offers = [];
    for (const vva of vendorAvailList) {
        const vehAvailsNode = vva.VehAvails ?? vva;
        const vehAvailList = asArray(vehAvailsNode?.VehAvail ?? vehAvailsNode);
        for (let i = 0; i < vehAvailList.length; i++) {
            const item = vehAvailList[i];
            const coreNode = item.VehAvailCore ?? item;
            const coreAttrs = attrs(coreNode);
            const vehID = coreAttrs.VehID || coreAttrs.VehId || '';
            const vehicle = coreNode.Vehicle ?? {};
            const vehMakeModel = vehicle.VehMakeModel ?? {};
            const makeModelAttrs = attrs(vehMakeModel);
            const vehType = vehicle.VehType ?? {};
            const vehTypeAttrs = attrs(vehType);
            const vehClass = vehicle.VehClass ?? {};
            const vehClassAttrs = attrs(vehClass);
            const vehicleAttrs = attrs(vehicle);
            const vehTerms = coreNode.VehTerms ?? {};
            const included = asArray(vehTerms.Included).map((x) => {
                const inner = Array.isArray(x) ? x[0] : x;
                const t = inner?.['@attributes'];
                return t ? { code: t.code, mandatory: t.mandatory, header: t.header, price: t.price, excess: t.excess, deposit: t.deposit, details: t.details } : {};
            });
            const notIncluded = asArray(vehTerms.NotIncluded).map((x) => {
                const inner = Array.isArray(x) ? x[0] : x;
                const t = inner?.['@attributes'];
                return t ? { code: t.code, mandatory: t.mandatory, header: t.header, price: t.price, excess: t.excess, deposit: t.deposit, details: t.details } : {};
            });
            const rentalRate = (Array.isArray(coreNode.RentalRate) ? coreNode.RentalRate[0] : coreNode.RentalRate) ?? {};
            const rateDistance = rentalRate.RateDistance;
            const rateQualifier = rentalRate.RateQualifier;
            const vehicleCharges = coreNode.VehicleCharges ?? {};
            const vehicleChargeList = asArray(vehicleCharges.VehicleCharge).map((ch) => {
                const a = attrs(ch);
                const out = { Amount: a.Amount, CurrencyCode: a.CurrencyCode, TaxInclusive: a.TaxInclusive, GuaranteedInd: a.GuaranteedInd, Purpose: a.Purpose };
                if (ch.TaxAmounts)
                    out.TaxAmounts = ch.TaxAmounts;
                if (ch.Calculation)
                    out.Calculation = ch.Calculation;
                return out;
            });
            const totalChargeNode = coreNode.TotalCharge ?? {};
            const totalChargeAttrs = attrs(totalChargeNode);
            const total_charge = (totalChargeAttrs.RateTotalAmount != null || totalChargeAttrs.CurrencyCode) ? {
                rate_total_amount: totalChargeAttrs.RateTotalAmount,
                currency_code: totalChargeAttrs.CurrencyCode,
                tax_inclusive: totalChargeAttrs.taxInclusive ?? 'true',
            } : undefined;
            const calculationNode = vehicleChargeList[0]?.Calculation;
            const calcRaw = calculationNode && typeof calculationNode === 'object' && calculationNode['@attributes'] ? calculationNode['@attributes'] : calculationNode;
            const calcAttrs = calcRaw && typeof calcRaw === 'object' ? calcRaw : {};
            const calculation = (calcAttrs.UnitCharge || calcAttrs.UnitName) ? {
                UnitCharge: calcAttrs.UnitCharge,
                UnitName: calcAttrs.UnitName,
                Quantity: calcAttrs.Quantity,
                taxInclusive: calcAttrs.taxInclusive,
            } : undefined;
            const pricedEquipsRaw = asArray(coreNode.PricedEquips);
            const priced_equips = [];
            for (const pe of pricedEquipsRaw) {
                const list = Array.isArray(pe) ? pe : (pe && pe.PricedEquip != null ? asArray(pe.PricedEquip) : [pe]);
                for (const p of list) {
                    const pricedEquip = p.PricedEquip ?? p;
                    const equipNode = pricedEquip?.Equipment ?? pricedEquip;
                    const equipAttrs = attrs(equipNode);
                    const chargeNode = pricedEquip?.Charge ?? {};
                    const charge = typeof chargeNode === 'object' ? chargeNode : {};
                    const calc = charge.Calculation;
                    const calcA = calc && typeof calc === 'object' && calc['@attributes'] ? calc['@attributes'] : (typeof calc === 'object' ? calc : {});
                    priced_equips.push({
                        description: equipAttrs.Description,
                        equip_type: equipAttrs.EquipType,
                        vendor_equip_id: equipAttrs.vendorEquipID ?? equipAttrs.vendorEquipId,
                        charge: {
                            Amount: charge.Amount,
                            UnitCharge: calcA.UnitCharge,
                            Quantity: calcA.Quantity,
                            TaxInclusive: charge.TaxInclusive ?? 'true',
                            Taxamounts: charge.Taxamounts ?? charge.TaxAmounts,
                            Calculation: charge.Calculation,
                        },
                    });
                }
            }
            const name = makeModelAttrs.Name ?? vehicle.Name;
            const totalPriceNum = total_charge?.rate_total_amount != null ? parseFloat(String(total_charge.rate_total_amount)) : NaN;
            const supplier_offer_ref = vehID || (criteria.agreement_ref && name ? `GEN-${(criteria.agreement_ref || '').substring(0, 10)}-${(sourceId || '').substring(0, 8)}-${i}-${Buffer.from(`${criteria.agreement_ref}-${name}-${totalPriceNum}-${i}`).toString('base64').substring(0, 8).replace(/[^A-Za-z0-9]/g, '')}` : '');
            const offer = {
                source_id: sourceId,
                agreement_ref: criteria.agreement_ref || '',
                vehicle_class: vehClassAttrs.Size ?? vehicle.Size ?? '',
                vehicle_make_model: name ?? '',
                rate_plan_code: '',
                currency: total_charge?.currency_code ?? '',
                total_price: Number.isFinite(totalPriceNum) ? totalPriceNum : 0,
                supplier_offer_ref: supplier_offer_ref || `GEN-${sourceId}-${i}-${Date.now()}`,
                availability_status: coreAttrs.Status ?? 'Available',
                veh_id: vehID || undefined,
                picture_url: makeModelAttrs.PictureURL ?? undefined,
                door_count: vehTypeAttrs.DoorCount ?? undefined,
                baggage: vehTypeAttrs.Baggage ?? undefined,
                vehicle_category: vehTypeAttrs.VehicleCategory ?? undefined,
                air_condition_ind: vehicleAttrs.AirConditionInd ?? undefined,
                transmission_type: vehicleAttrs.TransmissionType ?? undefined,
                veh_terms_included: included.length ? included : undefined,
                veh_terms_not_included: notIncluded.length ? notIncluded : undefined,
                vehicle_charges: vehicleChargeList.length ? vehicleChargeList : undefined,
                total_charge: total_charge ?? undefined,
                rate_distance: rateDistance,
                rate_qualifier: rateQualifier,
                calculation,
                priced_equips: priced_equips.length ? priced_equips : undefined,
                pickup_location_details: i === 0 ? pickup_location_details : undefined,
                return_location_details: i === 0 ? return_location_details : undefined,
            };
            offers.push(offer);
        }
    }
    return offers;
}
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
            const useOtaAvailabilityXml = this.config.useOtaAvailabilityXml === true;
            const path = '/availability';
            const url = `${this.config.endpoint}${path}`;
            console.log(`[GrpcAdapter] Making availability request to: ${url}`, {
                sourceId: this.config.sourceId,
                useOtaAvailabilityXml,
                endpoint: this.config.endpoint
            });
            let response;
            if (useOtaAvailabilityXml) {
                const xmlBody = buildOtaVehAvailRateRQ({
                    pickup_unlocode: criteria.pickup_unlocode || '',
                    dropoff_unlocode: criteria.dropoff_unlocode || '',
                    pickup_iso: criteria.pickup_iso || '',
                    dropoff_iso: criteria.dropoff_iso || '',
                    driver_age: criteria.driver_age,
                    residency_country: criteria.residency_country || 'US',
                    vehicle_classes: criteria.vehicle_classes,
                }, this.config.availabilityRequestorId || '1000097');
                response = await this.makeRequest('POST', path, xmlBody, true);
                if (typeof response === 'string') {
                    try {
                        response = JSON.parse(response);
                    }
                    catch {
                        // Leave as string if not JSON (e.g. XML response)
                    }
                }
            }
            else {
                response = await this.makeRequest('POST', path, otaCriteria);
            }
            // If response is string (e.g. wrong Content-Type or PHP returning JSON as text), try parsing as JSON
            if (typeof response === 'string') {
                const trimmed = response.trim();
                if ((trimmed.startsWith('{') && trimmed.includes('VehAvailRSCore')) || trimmed.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(response);
                        response = parsed;
                        console.log(`[GrpcAdapter] Parsed availability response as JSON (was string)`);
                    }
                    catch {
                        // Leave as string; will fall through and return [] for non-OTA
                    }
                }
            }
            console.log(`[GrpcAdapter] Availability response:`, {
                sourceId: this.config.sourceId,
                responseType: Array.isArray(response) ? 'array' : typeof response,
                responseLength: Array.isArray(response) ? response.length : 'N/A',
                hasVehAvailRSCore: !!(response && typeof response === 'object' && response.VehAvailRSCore)
            });
            // OTA-shaped response (e.g. from pricetest2.php returning VehAvailRS as JSON)
            if (typeof response === 'object' && isOtaVehAvailResponse(response)) {
                const offers = parseOtaVehAvailResponse(response, this.config.sourceId, criteria);
                console.log(`[GrpcAdapter] Parsed OTA VehAvailRS: ${offers.length} offers for source ${this.config.sourceId}`);
                return offers;
            }
            // Handle case where response is not an array (flat format)
            if (!Array.isArray(response)) {
                console.warn(`[GrpcAdapter] Expected array or OTA response, got:`, typeof response);
                return [];
            }
            // Convert flat array to internal format
            const offers = response.map((offer, index) => {
                // Generate supplier_offer_ref if missing
                let supplier_offer_ref = offer.SupplierOfferRef || offer.supplier_offer_ref || "";
                if (!supplier_offer_ref) {
                    // Generate a unique reference based on offer characteristics
                    // Format: GEN-{agreement_ref}-{source_id_short}-{index}-{hash}
                    const sourceIdShort = (this.config.sourceId || "").substring(0, 8);
                    const agreementRefShort = (criteria.agreement_ref || "").substring(0, 10);
                    const offerHash = Buffer.from(`${criteria.agreement_ref}-${offer.VehicleClass || offer.vehicle_class || ""}-${offer.VehicleMakeModel || offer.vehicle_make_model || ""}-${offer.TotalPrice || offer.total_price || 0}-${index}`).toString('base64').substring(0, 8).replace(/[^A-Za-z0-9]/g, '');
                    supplier_offer_ref = `GEN-${agreementRefShort}-${sourceIdShort}-${index}-${offerHash}`;
                    console.log(`[GrpcAdapter] 🔧 Generated supplier_offer_ref for offer ${index}:`, {
                        original: offer.SupplierOfferRef || offer.supplier_offer_ref || "(missing)",
                        generated: supplier_offer_ref,
                        agreement_ref: criteria.agreement_ref,
                        source_id: this.config.sourceId
                    });
                }
                return {
                    source_id: this.config.sourceId,
                    agreement_ref: criteria.agreement_ref,
                    vehicle_class: offer.VehicleClass || offer.vehicle_class,
                    vehicle_make_model: offer.VehicleMakeModel || offer.vehicle_make_model,
                    rate_plan_code: offer.RatePlanCode || offer.rate_plan_code,
                    currency: offer.Currency || offer.currency,
                    total_price: offer.TotalPrice || offer.total_price || 0,
                    supplier_offer_ref: supplier_offer_ref,
                    availability_status: offer.AvailabilityStatus || offer.availability_status
                };
            });
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
