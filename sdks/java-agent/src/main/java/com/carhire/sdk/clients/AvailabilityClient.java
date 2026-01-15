package com.carhire.sdk.clients;

import com.carhire.sdk.Config;
import com.carhire.sdk.transport.TransportInterface;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Stream;

public class AvailabilityClient {
    private final TransportInterface transport;
    private final Config config;

    public AvailabilityClient(TransportInterface transport, Config config) {
        this.transport = transport;
        this.config = config;
    }

    public Stream<CompletableFuture<Map<String, Object>>> search(Map<String, Object> criteria) {
        List<CompletableFuture<Map<String, Object>>> chunks = new ArrayList<>();

        // Validate criteria
        validateAvailabilityCriteria(criteria);

        CompletableFuture<Map<String, Object>> submitFuture = transport.availabilitySubmit(criteria);
        
        submitFuture.thenCompose(submit -> {
            String requestId = (String) submit.get("request_id");
            if (requestId == null) {
                return CompletableFuture.completedFuture(null);
            }

            int since = 0;
            long deadline = System.currentTimeMillis() + ((Number) config.get("availabilitySlaMs", 120000)).longValue();

            CompletableFuture<Map<String, Object>> lastFuture = CompletableFuture.completedFuture(null);

            while (System.currentTimeMillis() < deadline) {
                long remaining = Math.max(0, deadline - System.currentTimeMillis());
                int wait = (int) Math.min(((Number) config.get("longPollWaitMs", 10000)).longValue(), remaining);

                final int currentSince = since;
                CompletableFuture<Map<String, Object>> pollFuture = transport.availabilityPoll(requestId, currentSince, wait)
                    .thenCompose(res -> {
                        chunks.add(CompletableFuture.completedFuture(res));
                        String status = (String) res.get("status");
                        if ("COMPLETE".equals(status)) {
                            return CompletableFuture.completedFuture(null);
                        }
                        Object cursor = res.get("cursor");
                        if (cursor != null) {
                            since = ((Number) cursor).intValue();
                        }
                        return CompletableFuture.completedFuture(res);
                    });

                lastFuture = pollFuture;
                if ("COMPLETE".equals(lastFuture.join().get("status"))) {
                    break;
                }
            }

            return lastFuture;
        });

        return chunks.stream().map(CompletableFuture::join);
    }

    /**
     * Validates availability criteria according to SDK specification.
     * Normalizes locodes and currency to uppercase.
     * 
     * @param criteria The criteria map to validate
     * @throws IllegalArgumentException if validation fails
     */
    private void validateAvailabilityCriteria(Map<String, Object> criteria) {
        // Validate pickup_unlocode
        if (!criteria.containsKey("pickup_unlocode")) {
            throw new IllegalArgumentException("pickup_unlocode is required");
        }
        Object pickupUnlocodeObj = criteria.get("pickup_unlocode");
        if (!(pickupUnlocodeObj instanceof String) || ((String) pickupUnlocodeObj).trim().isEmpty()) {
            throw new IllegalArgumentException("pickup_unlocode is required");
        }
        String pickupUnlocode = ((String) pickupUnlocodeObj).trim().toUpperCase();
        criteria.put("pickup_unlocode", pickupUnlocode);

        // Validate dropoff_unlocode (returnLocode)
        if (!criteria.containsKey("dropoff_unlocode")) {
            throw new IllegalArgumentException("dropoff_unlocode is required");
        }
        Object dropoffUnlocodeObj = criteria.get("dropoff_unlocode");
        if (!(dropoffUnlocodeObj instanceof String) || ((String) dropoffUnlocodeObj).trim().isEmpty()) {
            throw new IllegalArgumentException("dropoff_unlocode is required");
        }
        String dropoffUnlocode = ((String) dropoffUnlocodeObj).trim().toUpperCase();
        criteria.put("dropoff_unlocode", dropoffUnlocode);

        // Validate pickup_iso
        if (!criteria.containsKey("pickup_iso")) {
            throw new IllegalArgumentException("pickup_iso is required");
        }
        Object pickupIsoObj = criteria.get("pickup_iso");
        if (!(pickupIsoObj instanceof String)) {
            throw new IllegalArgumentException("pickup_iso must be a valid ISO-8601 datetime string");
        }
        String pickupIso = (String) pickupIsoObj;
        Instant pickupAt;
        try {
            pickupAt = Instant.parse(pickupIso);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("pickup_iso must be a valid ISO-8601 datetime string", e);
        }

        // Validate dropoff_iso
        if (!criteria.containsKey("dropoff_iso")) {
            throw new IllegalArgumentException("dropoff_iso is required");
        }
        Object dropoffIsoObj = criteria.get("dropoff_iso");
        if (!(dropoffIsoObj instanceof String)) {
            throw new IllegalArgumentException("dropoff_iso must be a valid ISO-8601 datetime string");
        }
        String dropoffIso = (String) dropoffIsoObj;
        Instant dropoffAt;
        try {
            dropoffAt = Instant.parse(dropoffIso);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("dropoff_iso must be a valid ISO-8601 datetime string", e);
        }

        // Validate returnAt is after pickupAt
        if (!dropoffAt.isAfter(pickupAt)) {
            throw new IllegalArgumentException("dropoff_iso must be after pickup_iso");
        }

        // Validate driver_age
        if (!criteria.containsKey("driver_age")) {
            throw new IllegalArgumentException("driver_age is required");
        }
        Object driverAgeObj = criteria.get("driver_age");
        int driverAge;
        if (driverAgeObj instanceof Number) {
            driverAge = ((Number) driverAgeObj).intValue();
        } else {
            throw new IllegalArgumentException("driver_age must be a number");
        }
        if (driverAge < 18 || driverAge > 100) {
            throw new IllegalArgumentException("driver_age must be between 18 and 100");
        }

        // Validate currency
        if (!criteria.containsKey("currency")) {
            throw new IllegalArgumentException("currency is required");
        }
        Object currencyObj = criteria.get("currency");
        if (!(currencyObj instanceof String) || ((String) currencyObj).trim().isEmpty()) {
            throw new IllegalArgumentException("currency is required");
        }
        String currency = ((String) currencyObj).trim().toUpperCase();
        criteria.put("currency", currency);

        // Validate agreement_refs
        if (!criteria.containsKey("agreement_refs")) {
            throw new IllegalArgumentException("agreement_refs is required");
        }
        Object agreementRefsObj = criteria.get("agreement_refs");
        if (!(agreementRefsObj instanceof List)) {
            throw new IllegalArgumentException("agreement_refs must be a list");
        }
        @SuppressWarnings("unchecked")
        List<?> agreementRefs = (List<?>) agreementRefsObj;
        if (agreementRefs.isEmpty()) {
            throw new IllegalArgumentException("agreement_refs must be a non-empty list");
        }

        // Validate residency_country if provided
        if (criteria.containsKey("residency_country")) {
            Object residencyCountryObj = criteria.get("residency_country");
            if (residencyCountryObj instanceof String) {
                String residencyCountry = (String) residencyCountryObj;
                if (residencyCountry.length() != 2) {
                    throw new IllegalArgumentException("residency_country must be a 2-letter ISO code");
                }
            }
        }
    }
}

