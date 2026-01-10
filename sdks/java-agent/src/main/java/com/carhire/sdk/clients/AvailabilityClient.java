package com.carhire.sdk.clients;

import com.carhire.sdk.Config;
import com.carhire.sdk.transport.TransportInterface;

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

        if (!criteria.containsKey("agreement_refs") || 
            (criteria.get("agreement_refs") instanceof List && ((List<?>) criteria.get("agreement_refs")).isEmpty())) {
            throw new IllegalArgumentException("agreement_refs required");
        }

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
}

