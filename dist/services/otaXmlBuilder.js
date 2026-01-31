import { create } from 'xmlbuilder2';
import { logger } from '../infra/logger.js';
/**
 * Builds OTA_VehAvailRateRQ XML for vehicle availability requests.
 * Used when calling endpoints like pricetest2.php that expect OTA XML.
 */
export function buildOtaVehAvailRateRQ(criteria, requestorId = '1000097') {
    try {
        const root = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('OTA_VehAvailRateRQ', {
            'xmlns': 'http://www.opentravel.org/OTA/2003/05',
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xsi:schemaLocation': 'http://www.opentravel.org/OTA/2003/05 OTA_VehAvailRateRQ.xsd',
            TimeStamp: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
            Target: 'Production',
            Version: '1.002'
        });
        // POS - Point of Sale
        const pos = root.ele('POS');
        const source = pos.ele('Source');
        source.ele('RequestorID', { Type: '5', ID: requestorId });
        // VehAvailRQCore
        const core = root.ele('VehAvailRQCore', { Status: 'Available' });
        const vehRentalCore = core.ele('VehRentalCore', {
            PickUpDateTime: criteria.pickup_iso,
            ReturnDateTime: criteria.dropoff_iso
        });
        vehRentalCore.ele('PickUpLocation', { LocationCode: criteria.pickup_unlocode });
        vehRentalCore.ele('ReturnLocation', { LocationCode: criteria.dropoff_unlocode });
        core.ele('DriverType', { Age: String(criteria.driver_age ?? 30) });
        // VehAvailRQInfo - Customer (citizen country)
        const info = root.ele('VehAvailRQInfo');
        const customer = info.ele('Customer');
        const primary = customer.ele('Primary');
        primary.ele('CitizenCountryName', { Code: criteria.residency_country ?? 'US' });
        const xmlString = root.end({ prettyPrint: true });
        logger.debug({ pickup: criteria.pickup_unlocode, dropoff: criteria.dropoff_unlocode }, 'Generated OTA_VehAvailRateRQ XML');
        return xmlString;
    }
    catch (error) {
        logger.error({ error: error.message, criteria }, 'Failed to build OTA_VehAvailRateRQ');
        throw new Error(`Failed to build OTA_VehAvailRateRQ: ${error.message}`);
    }
}
/**
 * Builds OTA_VehResRQ XML structure for vehicle reservation requests
 * Based on OTA XML 2024A specification
 */
export function buildOtaVehResRQ(data) {
    try {
        const root = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('OTA_VehResRQ', {
            xmlns: 'http://www.opentravel.org/OTA/2003/05',
            TimeStamp: new Date().toISOString(),
            Target: 'Production',
            Version: '1.000',
            ReqRespVersion: '2024A'
        });
        // POS (Point of Sale) - REQUIRED
        const pos = root.ele('POS');
        const source = pos.ele('Source');
        source.ele('RequestorID', {
            ID: data.agentId,
            ID_Context: 'MIDDLEWARE',
            Type: '1' // 1 = Travel agency
        });
        if (data.agentCompanyName) {
            source.ele('BookingChannel', {
                Type: '1' // 1 = Agent
            }).ele('CompanyName').txt(data.agentCompanyName);
        }
        // VehResRQCore - REQUIRED
        const vehResCore = root.ele('VehResRQCore');
        // UniqueID (optional - for agent booking reference)
        if (data.agentBookingRef) {
            vehResCore.ele('UniqueID', {
                ID: data.agentBookingRef,
                ID_Context: 'AGENT',
                Type: '14' // 14 = Confirmation
            });
        }
        // VehRentalCore - contains pickup/dropoff locations and times
        if (data.pickupUnlocode || data.pickupDateTime || data.dropoffUnlocode || data.dropoffDateTime) {
            const vehRentalCore = vehResCore.ele('VehRentalCore');
            // Pickup location and time
            if (data.pickupUnlocode) {
                vehRentalCore.ele('PickUpLocation', {
                    LocationCode: data.pickupUnlocode
                });
            }
            if (data.pickupDateTime) {
                vehRentalCore.ele('PickUpDateTime').txt(data.pickupDateTime);
            }
            // Return location and time
            if (data.dropoffUnlocode) {
                vehRentalCore.ele('ReturnLocation', {
                    LocationCode: data.dropoffUnlocode
                });
            }
            if (data.dropoffDateTime) {
                vehRentalCore.ele('ReturnDateTime').txt(data.dropoffDateTime);
            }
        }
        // Customer information (optional)
        if (data.customerInfo) {
            const customer = vehResCore.ele('Customer');
            // Primary customer details
            if (data.customerInfo.firstName || data.customerInfo.lastName) {
                const personName = customer.ele('PersonName');
                if (data.customerInfo.firstName) {
                    personName.ele('GivenName').txt(data.customerInfo.firstName);
                }
                if (data.customerInfo.lastName) {
                    personName.ele('Surname').txt(data.customerInfo.lastName);
                }
            }
            // Contact information
            if (data.customerInfo.email || data.customerInfo.phone) {
                const telephone = customer.ele('Telephone');
                if (data.customerInfo.phone) {
                    telephone.att('PhoneNumber', data.customerInfo.phone);
                }
                if (data.customerInfo.email) {
                    customer.ele('Email').txt(data.customerInfo.email);
                }
            }
            // Address if provided
            if (data.customerInfo.address) {
                const address = customer.ele('Address');
                if (data.customerInfo.address.addressLine) {
                    address.ele('AddressLine').txt(data.customerInfo.address.addressLine);
                }
                if (data.customerInfo.address.city) {
                    address.ele('CityName').txt(data.customerInfo.address.city);
                }
                if (data.customerInfo.address.postalCode) {
                    address.ele('PostalCode').txt(data.customerInfo.address.postalCode);
                }
                if (data.customerInfo.address.country) {
                    address.ele('CountryName', { Code: data.customerInfo.address.country });
                }
            }
        }
        // Vehicle preference (optional)
        if (data.vehicleClass) {
            const vehPref = vehResCore.ele('VehPref');
            vehPref.att('VehicleClass', data.vehicleClass);
            if (data.vehicleMakeModel) {
                vehPref.att('MakeModel', data.vehicleMakeModel);
            }
        }
        // Driver type (optional)
        if (data.driverAge !== undefined) {
            const driverType = vehResCore.ele('DriverType');
            driverType.att('Age', data.driverAge.toString());
            if (data.residencyCountry) {
                driverType.att('ResidencyCountry', data.residencyCountry);
            }
        }
        // Rate qualifier (optional)
        if (data.ratePlanCode) {
            const rateQualifier = vehResCore.ele('RateQualifier');
            rateQualifier.att('RatePlanCode', data.ratePlanCode);
            // Include agreement reference if available
            if (data.agreementRef) {
                rateQualifier.att('PromoCode', data.agreementRef);
            }
        }
        // Supplier offer reference
        if (data.supplierOfferRef) {
            vehResCore.ele('Reference', {
                ID: data.supplierOfferRef,
                ID_Context: 'SUPPLIER_OFFER'
            });
        }
        // Payment information (optional - VehResRQInfo section)
        if (data.paymentInfo) {
            const vehResInfo = root.ele('VehResRQInfo');
            const paymentPrefs = vehResInfo.ele('PaymentPrefs');
            const paymentPref = paymentPrefs.ele('PaymentPref');
            if (data.paymentInfo.cardType) {
                paymentPref.att('Type', data.paymentInfo.cardType);
            }
            if (data.paymentInfo.cardNumber) {
                const cardHolder = paymentPref.ele('CardHolder');
                if (data.customerInfo?.firstName || data.customerInfo?.lastName) {
                    cardHolder.ele('PersonName').ele('Surname').txt(data.customerInfo.lastName || data.customerInfo.firstName || '');
                }
            }
        }
        // Convert to XML string
        const xmlString = root.end({ prettyPrint: true });
        logger.debug({
            agentId: data.agentId,
            agreementRef: data.agreementRef
        }, 'Generated OTA XML for booking request');
        return xmlString;
    }
    catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            agentId: data.agentId,
            agreementRef: data.agreementRef
        }, 'Failed to build OTA XML');
        throw new Error(`Failed to build OTA XML: ${error.message}`);
    }
}
/**
 * Converts internal booking payload to OTA booking data format
 */
export function convertToOtaBookingData(payload, agentId, agentCompanyName) {
    // Parse customer and payment info if they're JSON strings
    let customerInfo = payload.customer_info;
    if (typeof payload.customer_info_json === 'string') {
        try {
            customerInfo = JSON.parse(payload.customer_info_json);
        }
        catch (e) {
            // If parsing fails, try using customer_info directly
            customerInfo = payload.customer_info;
        }
    }
    let paymentInfo = payload.payment_info;
    if (typeof payload.payment_info_json === 'string') {
        try {
            paymentInfo = JSON.parse(payload.payment_info_json);
        }
        catch (e) {
            // If parsing fails, try using payment_info directly
            paymentInfo = payload.payment_info;
        }
    }
    return {
        agentId,
        agentCompanyName,
        agreementRef: payload.agreement_ref || '',
        supplierOfferRef: payload.supplier_offer_ref,
        agentBookingRef: payload.agent_booking_ref,
        pickupUnlocode: payload.pickup_unlocode,
        dropoffUnlocode: payload.dropoff_unlocode,
        pickupDateTime: payload.pickup_iso,
        dropoffDateTime: payload.dropoff_iso,
        vehicleClass: payload.vehicle_class,
        vehicleMakeModel: payload.vehicle_make_model,
        ratePlanCode: payload.rate_plan_code,
        driverAge: payload.driver_age,
        residencyCountry: payload.residency_country,
        customerInfo,
        paymentInfo,
    };
}
