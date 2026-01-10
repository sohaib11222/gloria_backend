package com.carhire.sdk.transport;

import com.carhire.sdk.Config;
import com.carhire.sdk.TransportException;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * gRPC transport – STUBS until proto files are generated and service clients are wired.
 * To generate stubs, run: mvn compile
 * Then implement methods by calling generated stubs with per-call deadlines and mTLS channel credentials.
 */
public class GrpcTransport implements TransportInterface {
    private final Config config;

    public GrpcTransport(Config config) {
        this.config = config;
    }

    @Override
    public CompletableFuture<Map<String, Object>> availabilitySubmit(Map<String, Object> criteria) {
        return CompletableFuture.failedFuture(
            new TransportException("gRPC not wired yet. Generate stubs and implement.")
        );
    }

    @Override
    public CompletableFuture<Map<String, Object>> availabilityPoll(String requestId, int sinceSeq, int waitMs) {
        return CompletableFuture.failedFuture(
            new TransportException("gRPC not wired yet. Generate stubs and implement.")
        );
    }

    @Override
    public CompletableFuture<Boolean> isLocationSupported(String agreementRef, String locode) {
        return CompletableFuture.failedFuture(
            new TransportException("gRPC not wired yet. Generate stubs and implement.")
        );
    }

    @Override
    public CompletableFuture<Map<String, Object>> bookingCreate(Map<String, Object> payload, String idempotencyKey) {
        return CompletableFuture.failedFuture(
            new TransportException("gRPC not wired yet. Generate stubs and implement.")
        );
    }

    @Override
    public CompletableFuture<Map<String, Object>> bookingModify(Map<String, Object> payload) {
        return CompletableFuture.failedFuture(
            new TransportException("gRPC not wired yet. Generate stubs and implement.")
        );
    }

    @Override
    public CompletableFuture<Map<String, Object>> bookingCancel(Map<String, Object> payload) {
        return CompletableFuture.failedFuture(
            new TransportException("gRPC not wired yet. Generate stubs and implement.")
        );
    }

    @Override
    public CompletableFuture<Map<String, Object>> bookingCheck(String supplierBookingRef, String agreementRef, String sourceId) {
        return CompletableFuture.failedFuture(
            new TransportException("gRPC not wired yet. Generate stubs and implement.")
        );
    }
}

