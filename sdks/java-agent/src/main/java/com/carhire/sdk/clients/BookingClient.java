package com.carhire.sdk.clients;

import com.carhire.sdk.Config;
import com.carhire.sdk.transport.TransportInterface;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class BookingClient {
    private final TransportInterface transport;
    private final Config config;

    public BookingClient(TransportInterface transport, Config config) {
        this.transport = transport;
        this.config = config;
    }

    public CompletableFuture<Map<String, Object>> create(Map<String, Object> dto, String idempotencyKey) {
        if (!dto.containsKey("agreement_ref")) {
            throw new IllegalArgumentException("agreement_ref required");
        }
        // Note: supplier_id is not required - backend resolves source_id from agreement_ref
        return transport.bookingCreate(dto, idempotencyKey);
    }

    public CompletableFuture<Map<String, Object>> modify(
        String supplierBookingRef,
        Map<String, Object> fields,
        String agreementRef,
        String sourceId
    ) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("supplier_booking_ref", supplierBookingRef);
        payload.put("agreement_ref", agreementRef);
        payload.put("fields", fields);
        return transport.bookingModify(payload);
    }

    public CompletableFuture<Map<String, Object>> cancel(
        String supplierBookingRef,
        String agreementRef,
        String sourceId
    ) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("supplier_booking_ref", supplierBookingRef);
        payload.put("agreement_ref", agreementRef);
        return transport.bookingCancel(payload);
    }

    public CompletableFuture<Map<String, Object>> check(
        String supplierBookingRef,
        String agreementRef,
        String sourceId
    ) {
        return transport.bookingCheck(supplierBookingRef, agreementRef, sourceId);
    }
}

