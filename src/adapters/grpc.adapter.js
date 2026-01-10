import { makeSupplierClient, metaWithAuth } from "../grpc/supplier.client.js";

export class GrpcAdapter {
  constructor({ endpoint, authHeader, sourceId }) {
    this.client = makeSupplierClient(endpoint);
    this.meta = metaWithAuth(authHeader || "");
    this.sourceId = sourceId;
  }

  async locations() {
    return new Promise((resolve, reject) => {
      this.client.Locations({}, this.meta, (err, res) => err ? reject(err) : resolve(res.unlocodes || []));
    });
  }

  async availability(c) {
    return new Promise((resolve, reject) => {
      this.client.Availability({
        pickup_unlocode: c.pickup_unlocode,
        dropoff_unlocode: c.dropoff_unlocode,
        pickup_iso: c.pickup_iso,
        dropoff_iso: c.dropoff_iso,
        driver_age: c.driver_age,
        residency_country: c.residency_country,
        vehicle_classes: c.vehicle_classes || [],
        agreement_ref: c.agreement_ref
      }, this.meta, (err, res) => err ? reject(err) : resolve((res.offers || []).map(o => ({
        ...o, source_id: this.sourceId
      }))));
    });
  }

  async bookingCreate(input) {
    return new Promise((resolve, reject) => {
      this.client.CreateBooking({
        agreement_ref: input.agreement_ref,
        supplier_offer_ref: input.supplier_offer_ref,
        agent_booking_ref: input.agent_booking_ref || ""
      }, this.meta, (err, res) => err ? reject(err) : resolve({
        supplier_booking_ref: res.supplier_booking_ref,
        status: res.status,
        agreement_ref: res.agreement_ref,
        supplier_offer_ref: input.supplier_offer_ref
      }));
    });
  }

  async bookingModify(input) {
    return new Promise((resolve, reject) => {
      // REQUIRED: agreement_ref must be sent to source on every call
      this.client.ModifyBooking({ 
        supplier_booking_ref: input.supplier_booking_ref,
        agreement_ref: input.agreement_ref 
      }, this.meta, (err, res) =>
        err ? reject(err) : resolve({ supplier_booking_ref: res.supplier_booking_ref, status: res.status, agreement_ref: res.agreement_ref || input.agreement_ref }));
    });
  }

  async bookingCancel(ref, agreement_ref) {
    return new Promise((resolve, reject) => {
      // REQUIRED: agreement_ref must be sent to source on every call
      this.client.CancelBooking({ 
        supplier_booking_ref: ref,
        agreement_ref: agreement_ref 
      }, this.meta, (err, res) =>
        err ? reject(err) : resolve({ supplier_booking_ref: res.supplier_booking_ref, status: res.status, agreement_ref: res.agreement_ref || agreement_ref }));
    });
  }

  async bookingCheck(ref, agreement_ref) {
    return new Promise((resolve, reject) => {
      // REQUIRED: agreement_ref must be sent to source on every call
      this.client.CheckBooking({ 
        supplier_booking_ref: ref,
        agreement_ref: agreement_ref 
      }, this.meta, (err, res) =>
        err ? reject(err) : resolve({ supplier_booking_ref: res.supplier_booking_ref, status: res.status, agreement_ref: res.agreement_ref || agreement_ref }));
    });
  }
}


