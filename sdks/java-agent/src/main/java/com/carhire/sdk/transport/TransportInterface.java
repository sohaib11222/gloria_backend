package com.carhire.sdk.transport;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

public interface TransportInterface {
    CompletableFuture<Map<String, Object>> availabilitySubmit(Map<String, Object> criteria);
    CompletableFuture<Map<String, Object>> availabilityPoll(String requestId, int sinceSeq, int waitMs);
    CompletableFuture<Boolean> isLocationSupported(String agreementRef, String locode);
    CompletableFuture<Map<String, Object>> bookingCreate(Map<String, Object> payload, String idempotencyKey);
    CompletableFuture<Map<String, Object>> bookingModify(Map<String, Object> payload);
    CompletableFuture<Map<String, Object>> bookingCancel(Map<String, Object> payload);
    CompletableFuture<Map<String, Object>> bookingCheck(String supplierBookingRef, String agreementRef, String sourceId);
}

