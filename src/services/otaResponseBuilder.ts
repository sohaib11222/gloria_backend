import { logger } from "../infra/logger.js";
import { prisma } from "../data/prisma.js";

/**
 * Builds OTA-compliant availability response structure (VehAvailRSCore)
 * Based on OTA_VehAvailRateRS specification
 */
export interface AvailabilityCriteria {
  pickup_unlocode?: string;
  dropoff_unlocode?: string;
  pickup_iso?: string;
  dropoff_iso?: string;
  driver_age?: number;
  residency_country?: string;
  vehicle_classes?: string[];
}

/** OTA VehTerms item (Included / NotIncluded) */
export interface VehTermAttr {
  code?: string;
  mandatory?: string;
  header?: string;
  price?: string;
  excess?: string;
  deposit?: string;
  details?: string;
}

/** OTA VehicleCharge item */
export interface VehicleChargeItem {
  Amount?: string;
  CurrencyCode?: string;
  TaxInclusive?: string;
  GuaranteedInd?: string;
  Purpose?: string;
  TaxAmounts?: { TaxAmount?: Array<{ "@attributes"?: { Total?: string; CurrencyCode?: string; Percentage?: string; Description?: string } }> };
  Calculation?: { "@attributes"?: { UnitCharge?: string; UnitName?: string; Quantity?: string; taxInclusive?: string } };
}

/** OTA PricedEquip item */
export interface PricedEquipItem {
  description?: string;
  equip_type?: string;
  vendor_equip_id?: string;
  charge?: {
    Amount?: string;
    UnitCharge?: string;
    Quantity?: string;
    TaxInclusive?: string;
    Taxamounts?: any;
    Calculation?: any;
  };
}

/** Location details for VehRentalCore PickUpLocation/ReturnLocation */
export interface LocationDetails {
  LocationCode?: string;
  locationname?: string;
  locationaddress?: string;
  locationcity?: string;
  locationpostcode?: string;
  locationtele?: string;
  emailaddress?: string;
  locationlong?: string;
  locationlat?: string;
}

export interface AvailabilityOffer {
  source_id?: string;
  agreement_ref?: string;
  vehicle_class?: string;
  vehicle_make_model?: string;
  rate_plan_code?: string;
  currency?: string;
  total_price?: number;
  supplier_offer_ref?: string;
  availability_status?: string;
  availability_request_id?: string;
  error?: string;
  message?: string;
  /** Rich OTA vehicle fields */
  veh_id?: string;
  picture_url?: string;
  door_count?: string;
  baggage?: string;
  vehicle_category?: string;
  air_condition_ind?: string;
  transmission_type?: string;
  veh_terms_included?: VehTermAttr[];
  veh_terms_not_included?: VehTermAttr[];
  vehicle_charges?: VehicleChargeItem[];
  total_charge?: { rate_total_amount?: string; currency_code?: string; tax_inclusive?: string };
  rate_distance?: any;
  rate_qualifier?: any;
  calculation?: { UnitCharge?: string; UnitName?: string; Quantity?: string; taxInclusive?: string };
  priced_equips?: PricedEquipItem[];
  pickup_location_details?: LocationDetails;
  return_location_details?: LocationDetails;
}

/**
 * Build OTA-compliant availability response
 */
export async function buildAvailabilityResponse(
  criteria: AvailabilityCriteria,
  offers: AvailabilityOffer[]
): Promise<any> {
  try {
    // Group offers by source/vendor
    const offersBySource = new Map<string, AvailabilityOffer[]>();
    
    for (const offer of offers) {
      // Skip error entries for grouping (they'll be added as warnings)
      if (offer.error) continue;
      
      const sourceId = offer.source_id || 'UNKNOWN';
      if (!offersBySource.has(sourceId)) {
        offersBySource.set(sourceId, []);
      }
      offersBySource.get(sourceId)!.push(offer);
    }

    // Build VehRentalCore from criteria; use first offer's location details if present
    const firstOfferWithLocation = offers.find(o => !o.error && (o.pickup_location_details || o.return_location_details));
    const pickupDetails = firstOfferWithLocation?.pickup_location_details;
    const returnDetails = firstOfferWithLocation?.return_location_details;

    const vehRentalCore: any = {};
    if (criteria.pickup_unlocode || pickupDetails) {
      const locCode = criteria.pickup_unlocode || pickupDetails?.LocationCode;
      if (pickupDetails && (pickupDetails.locationname || pickupDetails.locationaddress || pickupDetails.emailaddress)) {
        vehRentalCore.PickUpLocation = {
          "@attributes": {
            LocationCode: locCode || "",
            ...(pickupDetails.locationname && { Locationname: pickupDetails.locationname }),
            ...(pickupDetails.locationaddress && { Locationaddress: pickupDetails.locationaddress }),
            ...(pickupDetails.locationcity && { Locationcity: pickupDetails.locationcity }),
            ...(pickupDetails.locationpostcode && { Locationpostcode: pickupDetails.locationpostcode }),
            ...(pickupDetails.locationtele && { Locationtele: pickupDetails.locationtele }),
            ...(pickupDetails.emailaddress && { emailaddress: pickupDetails.emailaddress }),
            ...(pickupDetails.locationlong && { Locationlong: pickupDetails.locationlong }),
            ...(pickupDetails.locationlat && { Locationlat: pickupDetails.locationlat }),
          },
        };
      } else {
        vehRentalCore.PickUpLocation = { LocationCode: locCode || criteria.pickup_unlocode };
      }
    }
    if (criteria.dropoff_unlocode || returnDetails) {
      const locCode = criteria.dropoff_unlocode || returnDetails?.LocationCode;
      if (returnDetails && (returnDetails.locationname || returnDetails.locationaddress || returnDetails.emailaddress)) {
        vehRentalCore.ReturnLocation = {
          "@attributes": {
            LocationCode: locCode || "",
            ...(returnDetails.locationname && { Locationname: returnDetails.locationname }),
            ...(returnDetails.locationaddress && { Locationaddress: returnDetails.locationaddress }),
            ...(returnDetails.locationcity && { Locationcity: returnDetails.locationcity }),
            ...(returnDetails.locationpostcode && { Locationpostcode: returnDetails.locationpostcode }),
            ...(returnDetails.locationtele && { Locationtele: returnDetails.locationtele }),
            ...(returnDetails.emailaddress && { emailaddress: returnDetails.emailaddress }),
            ...(returnDetails.locationlong && { Locationlong: returnDetails.locationlong }),
            ...(returnDetails.locationlat && { Locationlat: returnDetails.locationlat }),
          },
        };
      } else {
        vehRentalCore.ReturnLocation = { LocationCode: locCode || criteria.dropoff_unlocode };
      }
    }
    if (criteria.pickup_iso) {
      vehRentalCore.PickUpDateTime = criteria.pickup_iso;
    }
    if (criteria.dropoff_iso) {
      vehRentalCore.ReturnDateTime = criteria.dropoff_iso;
    }

    // Build VehVendorAvails array
    const vehVendorAvails: any[] = [];
    
    // Batch fetch all company info to avoid N+1 queries
    const sourceIds = Array.from(offersBySource.keys());
    const companies = await prisma.company.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, companyName: true },
    });
    const companyMap = new Map(companies.map(c => [c.id, c]));
    
    for (const [sourceId, sourceOffers] of offersBySource.entries()) {
      // Get source company info for Vendor element
      let vendorInfo: any = { Code: sourceId };
      const company = companyMap.get(sourceId);
      if (company?.companyName) {
        vendorInfo.CompanyName = company.companyName;
      }

      // Build VehAvails array for this vendor
      const vehAvails: any[] = [];
      
      for (const offer of sourceOffers) {
        const vehAvail: any = {
          VehAvailCore: {
            Vehicle: {},
            RentalRate: [],
            Status: offer.availability_status || "Available",
          },
        };

        // VehAvailCore @attributes (VehID)
        if (offer.veh_id || offer.supplier_offer_ref) {
          vehAvail.VehAvailCore["@attributes"] = {
            Status: offer.availability_status || "Available",
            RStatus: "Inc",
            VehID: offer.veh_id || offer.supplier_offer_ref || "",
          };
        }

        // Vehicle information (rich when present)
        const v = vehAvail.VehAvailCore.Vehicle;
        if (offer.vehicle_category) {
          v.VehType = v.VehType || {};
          v.VehType["@attributes"] = {
            VehicleCategory: offer.vehicle_category,
            ...(offer.door_count && { DoorCount: offer.door_count }),
            ...(offer.baggage && { Baggage: offer.baggage }),
          };
        }
        if (offer.vehicle_class) {
          v.VehClass = { "@attributes": { Size: offer.vehicle_class } };
        }
        if (offer.vehicle_make_model) {
          v.VehMakeModel = v.VehMakeModel || {};
          v.VehMakeModel["@attributes"] = {
            Name: offer.vehicle_make_model,
            ...(offer.picture_url && { PictureURL: offer.picture_url }),
          };
        }
        if (offer.air_condition_ind || offer.transmission_type) {
          v["@attributes"] = {
            ...(offer.air_condition_ind && { AirConditionInd: offer.air_condition_ind }),
            ...(offer.transmission_type && { TransmissionType: offer.transmission_type }),
          };
        }

        // VehTerms (Included / NotIncluded)
        if (offer.veh_terms_included?.length || offer.veh_terms_not_included?.length) {
          vehAvail.VehAvailCore.VehTerms = {};
          if (offer.veh_terms_included?.length) {
            vehAvail.VehAvailCore.VehTerms.Included = offer.veh_terms_included.map(t => ({
              "@attributes": {
                code: t.code,
                mandatory: t.mandatory ?? "Yes",
                header: t.header,
                price: t.price,
                excess: t.excess,
                deposit: t.deposit,
                details: t.details,
              },
            }));
          }
          if (offer.veh_terms_not_included?.length) {
            vehAvail.VehAvailCore.VehTerms.NotIncluded = offer.veh_terms_not_included.map(t => ({
              "@attributes": {
                code: t.code,
                mandatory: t.mandatory ?? "No",
                header: t.header,
                price: t.price,
                excess: t.excess,
                deposit: t.deposit,
                details: t.details,
              },
            }));
          }
        }

        // RentalRate (rich when present)
        const rentalRate: any = {};
        if (offer.rate_distance) {
          rentalRate.RateDistance = Array.isArray(offer.rate_distance) ? offer.rate_distance[0] : offer.rate_distance;
        } else {
          rentalRate.RateDistance = { Unlimited: true };
        }
        if (offer.rate_qualifier) {
          rentalRate.RateQualifier = Array.isArray(offer.rate_qualifier) ? offer.rate_qualifier[0] : offer.rate_qualifier;
        }
        if (offer.total_charge?.rate_total_amount !== undefined && offer.total_charge?.currency_code) {
          rentalRate.TotalCharge = {
            "@attributes": {
              RateTotalAmount: offer.total_charge.rate_total_amount,
              CurrencyCode: offer.total_charge.currency_code,
              taxInclusive: offer.total_charge.tax_inclusive ?? "true",
            },
          };
        } else if (offer.total_price !== undefined && offer.currency) {
          rentalRate.TotalCharge = {
            "@attributes": {
              RateTotalAmount: String(offer.total_price),
              CurrencyCode: offer.currency,
              taxInclusive: "true",
            },
          };
        }
        if (offer.vehicle_charges?.length) {
          rentalRate.VehicleCharges = {
            VehicleCharge: offer.vehicle_charges.map(ch => {
              const out: any = {};
              if (ch.Amount !== undefined || ch.CurrencyCode !== undefined) {
                out["@attributes"] = {
                  ...(ch.Amount !== undefined && { Amount: ch.Amount }),
                  ...(ch.CurrencyCode !== undefined && { CurrencyCode: ch.CurrencyCode }),
                  ...(ch.TaxInclusive !== undefined && { TaxInclusive: ch.TaxInclusive }),
                  ...(ch.GuaranteedInd !== undefined && { GuaranteedInd: ch.GuaranteedInd }),
                  ...(ch.Purpose !== undefined && { Purpose: ch.Purpose }),
                };
              }
              if (ch.TaxAmounts) out.TaxAmounts = ch.TaxAmounts;
              if (ch.Calculation) out.Calculation = ch.Calculation;
              return out;
            }),
          };
        } else {
          rentalRate.VehicleCharges = { VehicleCharge: [] };
        }
        vehAvail.VehAvailCore.RentalRate.push(rentalRate);

        // PricedEquips (rich when present)
        if (offer.priced_equips?.length) {
          vehAvail.VehAvailCore.PricedEquips = {
            PricedEquip: offer.priced_equips.map(eq => ({
              Equipment: {
                "@attributes": {
                  Description: eq.description,
                  EquipType: eq.equip_type,
                  vendorEquipID: eq.vendor_equip_id,
                },
              },
              Charge: eq.charge ? {
                ...(eq.charge.Amount !== undefined && { Amount: eq.charge.Amount }),
                ...(eq.charge.UnitCharge !== undefined && { Calculation: { "@attributes": { UnitCharge: eq.charge.UnitCharge, UnitName: "Day", Quantity: eq.charge.Quantity, TaxInclusive: eq.charge.TaxInclusive ?? "True" } } }),
                ...(eq.charge.Taxamounts && { Taxamounts: eq.charge.Taxamounts }),
                ...(eq.charge.Calculation && { Calculation: eq.charge.Calculation }),
                TaxInclusive: eq.charge.TaxInclusive ?? "true",
                IncludedRate: "false",
                IncludedInEstTotalInd: "false",
              } : {},
            })),
          };
        } else {
          vehAvail.VehAvailCore.PricedEquips = { PricedEquip: [] };
        }

        vehAvail.VehAvailCore.Fees = { Fee: [] };

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
    const warnings: any[] = [];
    for (const offer of offers) {
      if (offer.error || offer.message) {
        warnings.push({
          Type: offer.error || "WARNING",
          Message: offer.message || offer.error || "Unknown error",
        });
      }
    }

    // Build final response structure
    const response: any = {
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
  } catch (error) {
    logger.error({ error }, "Failed to build availability response");
    throw error;
  }
}

/**
 * Builds OTA-compliant booking response structure (VehResRSCore)
 * Based on OTA_VehResRS specification
 */
export interface BookingData {
  supplier_booking_ref?: string;
  agent_booking_ref?: string;
  agreement_ref?: string;
  source_id?: string;
  status?: string;
  pickup_unlocode?: string;
  dropoff_unlocode?: string;
  pickup_iso?: string;
  dropoff_iso?: string;
  vehicle_class?: string;
  vehicle_make_model?: string;
  rate_plan_code?: string;
  currency?: string;
  total_price?: number;
  driver_age?: number;
  residency_country?: string;
  customer_info?: any;
  payment_info?: any;
  contract_id?: string;
}

/**
 * Build OTA-compliant booking response
 */
export async function buildBookingResponse(
  booking: BookingData,
  sourceResponse?: any
): Promise<any> {
  try {
    // Build VehRentalCore
    const vehRentalCore: any = {};
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
    const customer: any = {};
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
    let vendor: any = {};
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
      } catch (e) {
        logger.warn({ error: e, sourceId: booking.source_id }, "Failed to fetch company name for vendor");
        // If lookup fails, continue without company name
      }
    }

    // Build Vehicle information
    const vehicle: any = {};
    if (booking.vehicle_class) {
      vehicle.VehicleCategory = "Car";
      vehicle.Size = booking.vehicle_class;
    }
    if (booking.vehicle_make_model) {
      vehicle.Name = booking.vehicle_make_model;
    }

    // Build RentalRate
    const rentalRate: any = {};
    if (booking.total_price !== undefined && booking.currency) {
      rentalRate.TotalCharge = {
        RateTotalAmount: booking.total_price,
        CurrencyCode: booking.currency,
      };
    }
    rentalRate.RateDistance = { Unlimited: true };
    rentalRate.VehicleCharges = { VehicleCharge: [] };

    // Build ConfID array (supplier booking reference)
    const confIDs: any[] = [];
    if (booking.supplier_booking_ref) {
      confIDs.push({
        ID: booking.supplier_booking_ref,
        ID_Context: "SUPPLIER",
      });
    }

    // Build VehSegmentCore
    const vehSegmentCore: any = {
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
    const vehReservation: any = {
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
    const vehResRSCore: any = {
      VehReservation: vehReservation,
    };

    // Map booking status to ReservationStatus
    const statusMap: Record<string, string> = {
      REQUESTED: "Requested",
      CONFIRMED: "Confirmed",
      CANCELLED: "Cancelled",
      FAILED: "Failed",
    };
    if (booking.status) {
      vehResRSCore.ReservationStatus = statusMap[booking.status] || booking.status;
    }

    // Build final response
    const response: any = {
      Success: {},
      VehResRSCore: vehResRSCore,
    };

    return response;
  } catch (error) {
    logger.error({ error }, "Failed to build booking response");
    throw error;
  }
}

/**
 * Builds OTA-compliant check booking response structure (VehRetResRSCore)
 * Based on OTA_VehRetResRS specification
 */
export async function buildCheckBookingResponse(
  bookings: BookingData[],
  isSingleMatch: boolean = true
): Promise<any> {
  try {
    const response: any = {
      Success: {},
    };

    if (isSingleMatch && bookings.length === 1) {
      // Single match: return full VehReservation
      const vehReservation = await buildBookingResponse(bookings[0]);
      response.VehRetResRSCore = {
        VehReservation: vehReservation.VehReservation,
      };
    } else if (bookings.length > 1) {
      // Multiple matches: return VehResSummaries
      const summaries: any[] = [];
      
      for (const booking of bookings) {
        const summary: any = {};
        
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
    } else {
      // No matches
      response.VehRetResRSCore = {};
    }

    return response;
  } catch (error) {
    logger.error({ error }, "Failed to build check booking response");
    throw error;
  }
}

