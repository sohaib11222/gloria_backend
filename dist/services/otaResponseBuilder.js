import { logger } from "../infra/logger.js";
import { prisma } from "../data/prisma.js";
/**
 * Build OTA-compliant availability response
 */
export async function buildAvailabilityResponse(criteria, offers) {
    try {
        // Group offers by source/vendor
        const offersBySource = new Map();
        for (const offer of offers) {
            // Skip error entries for grouping (they'll be added as warnings)
            if (offer.error)
                continue;
            const sourceId = offer.source_id || 'UNKNOWN';
            if (!offersBySource.has(sourceId)) {
                offersBySource.set(sourceId, []);
            }
            offersBySource.get(sourceId).push(offer);
        }
        // Build VehRentalCore from criteria
        const vehRentalCore = {};
        if (criteria.pickup_unlocode) {
            vehRentalCore.PickUpLocation = { LocationCode: criteria.pickup_unlocode };
        }
        if (criteria.dropoff_unlocode) {
            vehRentalCore.ReturnLocation = { LocationCode: criteria.dropoff_unlocode };
        }
        if (criteria.pickup_iso) {
            vehRentalCore.PickUpDateTime = criteria.pickup_iso;
        }
        if (criteria.dropoff_iso) {
            vehRentalCore.ReturnDateTime = criteria.dropoff_iso;
        }
        // Build VehVendorAvails array
        const vehVendorAvails = [];
        // Batch fetch all company info to avoid N+1 queries
        const sourceIds = Array.from(offersBySource.keys());
        const companies = await prisma.company.findMany({
            where: { id: { in: sourceIds } },
            select: { id: true, companyName: true },
        });
        const companyMap = new Map(companies.map(c => [c.id, c]));
        for (const [sourceId, sourceOffers] of offersBySource.entries()) {
            // Get source company info for Vendor element
            let vendorInfo = { Code: sourceId };
            const company = companyMap.get(sourceId);
            if (company?.companyName) {
                vendorInfo.CompanyName = company.companyName;
            }
            // Build VehAvails array for this vendor
            const vehAvails = [];
            for (const offer of sourceOffers) {
                const vehAvail = {
                    VehAvailCore: {
                        Vehicle: {},
                        RentalRate: [],
                        Status: offer.availability_status || "Available",
                    },
                };
                // Vehicle information
                if (offer.vehicle_class) {
                    vehAvail.VehAvailCore.Vehicle.VehicleCategory = "Car";
                    vehAvail.VehAvailCore.Vehicle.Size = offer.vehicle_class;
                }
                if (offer.vehicle_make_model) {
                    vehAvail.VehAvailCore.Vehicle.Name = offer.vehicle_make_model;
                }
                // RentalRate (at least one required)
                const rentalRate = {};
                if (offer.total_price !== undefined && offer.currency) {
                    rentalRate.TotalCharge = {
                        RateTotalAmount: offer.total_price,
                        CurrencyCode: offer.currency,
                    };
                }
                // RateDistance (assume unlimited if not specified)
                rentalRate.RateDistance = { Unlimited: true };
                // VehicleCharges (empty for now, can be extended)
                rentalRate.VehicleCharges = { VehicleCharge: [] };
                vehAvail.VehAvailCore.RentalRate.push(rentalRate);
                // PricedEquips (empty for now, can be extended)
                vehAvail.VehAvailCore.PricedEquips = { PricedEquip: [] };
                // Fees (empty for now, can be extended)
                vehAvail.VehAvailCore.Fees = { Fee: [] };
                // Supplier offer reference
                if (offer.supplier_offer_ref) {
                    vehAvail.VehAvailCore.SupplierOfferRef = offer.supplier_offer_ref;
                }
                vehAvails.push(vehAvail);
            }
            vehVendorAvails.push({
                Vendor: vendorInfo,
                VehAvails: {
                    VehAvail: vehAvails,
                },
            });
        }
        // Build warnings from error offers
        const warnings = [];
        for (const offer of offers) {
            if (offer.error || offer.message) {
                warnings.push({
                    Type: offer.error || "WARNING",
                    Message: offer.message || offer.error || "Unknown error",
                });
            }
        }
        // Build final response structure
        const response = {
            Success: {},
        };
        if (warnings.length > 0) {
            response.Warnings = {
                Warning: warnings,
            };
        }
        if (Object.keys(vehRentalCore).length > 0 || vehVendorAvails.length > 0) {
            response.VehAvailRSCore = {
                VehRentalCore: vehRentalCore,
                VehVendorAvails: {
                    VehVendorAvail: vehVendorAvails,
                },
            };
        }
        return response;
    }
    catch (error) {
        logger.error({ error }, "Failed to build availability response");
        throw error;
    }
}
/**
 * Build OTA-compliant booking response
 */
export async function buildBookingResponse(booking, sourceResponse) {
    try {
        // Build VehRentalCore
        const vehRentalCore = {};
        if (booking.pickup_unlocode) {
            vehRentalCore.PickUpLocation = { LocationCode: booking.pickup_unlocode };
        }
        if (booking.dropoff_unlocode) {
            vehRentalCore.ReturnLocation = { LocationCode: booking.dropoff_unlocode };
        }
        if (booking.pickup_iso) {
            vehRentalCore.PickUpDateTime = booking.pickup_iso;
        }
        if (booking.dropoff_iso) {
            vehRentalCore.ReturnDateTime = booking.dropoff_iso;
        }
        // Build Customer information
        const customer = {};
        if (booking.customer_info) {
            if (booking.customer_info.firstName || booking.customer_info.lastName) {
                customer.PersonName = {};
                if (booking.customer_info.firstName) {
                    customer.PersonName.GivenName = booking.customer_info.firstName;
                }
                if (booking.customer_info.lastName) {
                    customer.PersonName.Surname = booking.customer_info.lastName;
                }
            }
            if (booking.customer_info.email) {
                customer.Email = booking.customer_info.email;
            }
            if (booking.customer_info.phone) {
                customer.Telephone = { PhoneNumber: booking.customer_info.phone };
            }
        }
        // Build Vendor information
        let vendor = {};
        if (booking.source_id) {
            vendor.Code = booking.source_id;
            try {
                const company = await prisma.company.findUnique({
                    where: { id: booking.source_id },
                    select: { companyName: true },
                });
                if (company?.companyName) {
                    vendor.CompanyName = company.companyName;
                }
            }
            catch (e) {
                logger.warn({ error: e, sourceId: booking.source_id }, "Failed to fetch company name for vendor");
                // If lookup fails, continue without company name
            }
        }
        // Build Vehicle information
        const vehicle = {};
        if (booking.vehicle_class) {
            vehicle.VehicleCategory = "Car";
            vehicle.Size = booking.vehicle_class;
        }
        if (booking.vehicle_make_model) {
            vehicle.Name = booking.vehicle_make_model;
        }
        // Build RentalRate
        const rentalRate = {};
        if (booking.total_price !== undefined && booking.currency) {
            rentalRate.TotalCharge = {
                RateTotalAmount: booking.total_price,
                CurrencyCode: booking.currency,
            };
        }
        rentalRate.RateDistance = { Unlimited: true };
        rentalRate.VehicleCharges = { VehicleCharge: [] };
        // Build ConfID array (supplier booking reference)
        const confIDs = [];
        if (booking.supplier_booking_ref) {
            confIDs.push({
                ID: booking.supplier_booking_ref,
                ID_Context: "SUPPLIER",
            });
        }
        // Build VehSegmentCore
        const vehSegmentCore = {
            Vehicle: vehicle,
            RentalRate: rentalRate,
            PricedEquips: { PricedEquip: [] },
            Fees: { Fee: [] },
            ConfID: confIDs,
        };
        if (booking.contract_id) {
            vehSegmentCore.ContractID = booking.contract_id;
        }
        if (rentalRate.TotalCharge) {
            vehSegmentCore.TotalCharge = rentalRate.TotalCharge;
        }
        // Build VehReservation
        const vehReservation = {
            VehRentalCore: vehRentalCore,
            VehSegmentCore: vehSegmentCore,
        };
        if (booking.agent_booking_ref) {
            vehReservation.UniqueID = {
                ID: booking.agent_booking_ref,
                ID_Context: "AGENT",
            };
        }
        if (Object.keys(customer).length > 0) {
            vehReservation.Customer = customer;
        }
        if (Object.keys(vendor).length > 0) {
            vehReservation.Vendor = vendor;
        }
        // Build VehResRSCore
        const vehResRSCore = {
            VehReservation: vehReservation,
        };
        // Map booking status to ReservationStatus
        const statusMap = {
            REQUESTED: "Requested",
            CONFIRMED: "Confirmed",
            CANCELLED: "Cancelled",
            FAILED: "Failed",
        };
        if (booking.status) {
            vehResRSCore.ReservationStatus = statusMap[booking.status] || booking.status;
        }
        // Build final response
        const response = {
            Success: {},
            VehResRSCore: vehResRSCore,
        };
        return response;
    }
    catch (error) {
        logger.error({ error }, "Failed to build booking response");
        throw error;
    }
}
/**
 * Builds OTA-compliant check booking response structure (VehRetResRSCore)
 * Based on OTA_VehRetResRS specification
 */
export async function buildCheckBookingResponse(bookings, isSingleMatch = true) {
    try {
        const response = {
            Success: {},
        };
        if (isSingleMatch && bookings.length === 1) {
            // Single match: return full VehReservation
            const vehReservation = await buildBookingResponse(bookings[0]);
            response.VehRetResRSCore = {
                VehReservation: vehReservation.VehReservation,
            };
        }
        else if (bookings.length > 1) {
            // Multiple matches: return VehResSummaries
            const summaries = [];
            for (const booking of bookings) {
                const summary = {};
                if (booking.supplier_booking_ref) {
                    summary.ConfID = [{
                            ID: booking.supplier_booking_ref,
                            ID_Context: "SUPPLIER",
                        }];
                }
                if (booking.pickup_unlocode) {
                    summary.PickUpLocation = { LocationCode: booking.pickup_unlocode };
                }
                if (booking.dropoff_unlocode) {
                    summary.ReturnLocation = { LocationCode: booking.dropoff_unlocode };
                }
                if (booking.pickup_iso) {
                    summary.PickUpDateTime = booking.pickup_iso;
                }
                if (booking.dropoff_iso) {
                    summary.ReturnDateTime = booking.dropoff_iso;
                }
                if (booking.customer_info) {
                    if (booking.customer_info.firstName || booking.customer_info.lastName) {
                        summary.PersonName = {};
                        if (booking.customer_info.firstName) {
                            summary.PersonName.GivenName = booking.customer_info.firstName;
                        }
                        if (booking.customer_info.lastName) {
                            summary.PersonName.Surname = booking.customer_info.lastName;
                        }
                    }
                }
                if (booking.vehicle_class || booking.vehicle_make_model) {
                    summary.Vehicle = {};
                    if (booking.vehicle_class) {
                        summary.Vehicle.Size = booking.vehicle_class;
                    }
                    if (booking.vehicle_make_model) {
                        summary.Vehicle.Name = booking.vehicle_make_model;
                    }
                }
                if (booking.source_id) {
                    summary.Vendor = { Code: booking.source_id };
                }
                if (booking.status) {
                    summary.ReservationStatus = booking.status;
                }
                summaries.push(summary);
            }
            response.VehRetResRSCore = {
                VehResSummaries: {
                    VehResSummary: summaries,
                },
            };
        }
        else {
            // No matches
            response.VehRetResRSCore = {};
        }
        return response;
    }
    catch (error) {
        logger.error({ error }, "Failed to build check booking response");
        throw error;
    }
}
