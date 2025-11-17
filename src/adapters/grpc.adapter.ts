// gRPC adapter implementation for connecting to external suppliers
import axios from 'axios';

export class GrpcAdapter {
  constructor(private config: { endpoint: string; authHeader: string; sourceId: string }) {}

  private async makeRequest(method: string, path: string, data?: any): Promise<any> {
    const url = `${this.config.endpoint}${path}`;
    const headers: any = {
      'Content-Type': 'application/json'
    };
    
    if (this.config.authHeader) {
      headers['Authorization'] = this.config.authHeader;
    }

    try {
      const response = await axios({
        method,
        url,
        data,
        headers,
        timeout: 30000
      });
      return response.data;
    } catch (error: any) {
      console.error(`gRPC Adapter error for ${method} ${path}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async locations(): Promise<string[]> {
    try {
      const response = await this.makeRequest('GET', '/locations');
      // Extract location codes from the response
      return response.map((loc: any) => loc.LocationCode || loc.unlocode || loc).filter(Boolean);
    } catch (error) {
      console.error('Failed to fetch locations:', error);
      return [];
    }
  }

  async availability(criteria: any): Promise<any[]> {
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
      return response.map((offer: any) => ({
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
    } catch (error) {
      console.error('Failed to fetch availability:', error);
      return [];
    }
  }

  async bookingCreate(input: any): Promise<any> {
    try {
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
        ResidencyCountry: input.residency_country
      };

      const response = await this.makeRequest('POST', '/booking/create', bookingData);
      
      return {
        supplier_booking_ref: response.SupplierBookingRef,
        status: response.Status,
        agreement_ref: response.AgreementRef,
        supplier_offer_ref: response.SupplierOfferRef
      };
    } catch (error) {
      console.error('Failed to create booking:', error);
      throw error;
    }
  }

  async bookingModify(input: any): Promise<any> {
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
    } catch (error) {
      console.error('Failed to modify booking:', error);
      throw error;
    }
  }

  async bookingCancel(ref: string, agreement_ref: string): Promise<any> {
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
    } catch (error) {
      console.error('Failed to cancel booking:', error);
      throw error;
    }
  }

  async bookingCheck(ref: string, agreement_ref: string): Promise<any> {
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
    } catch (error) {
      console.error('Failed to check booking:', error);
      throw error;
    }
  }
}
