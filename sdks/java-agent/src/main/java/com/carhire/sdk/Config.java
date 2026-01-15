package com.carhire.sdk;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class Config {
    private final boolean grpc;
    private final Map<String, Object> data;

    private Config(boolean grpc, Map<String, Object> data) {
        this.grpc = grpc;
        Map<String, Object> defaults = new HashMap<>();
        defaults.put("baseUrl", "");
        defaults.put("token", "");
        defaults.put("apiKey", "");
        defaults.put("agentId", "");
        defaults.put("callTimeoutMs", 10000);
        defaults.put("availabilitySlaMs", 120000);
        defaults.put("longPollWaitMs", 10000);
        defaults.put("correlationId", "java-sdk-" + UUID.randomUUID().toString().substring(0, 12));
        defaults.put("host", "");
        defaults.put("caCert", "");
        defaults.put("clientCert", "");
        defaults.put("clientKey", "");
        defaults.putAll(data);
        this.data = defaults;
    }

    public static Config forGrpc(Map<String, Object> data) {
        // Validation
        if (!data.containsKey("host") || data.get("host") == null || 
            !(data.get("host") instanceof String) || ((String) data.get("host")).trim().isEmpty()) {
            throw new IllegalArgumentException("host is required for gRPC configuration");
        }
        if (!data.containsKey("caCert") || data.get("caCert") == null || 
            !(data.get("caCert") instanceof String) || ((String) data.get("caCert")).trim().isEmpty()) {
            throw new IllegalArgumentException("caCert is required for gRPC configuration");
        }
        if (!data.containsKey("clientCert") || data.get("clientCert") == null || 
            !(data.get("clientCert") instanceof String) || ((String) data.get("clientCert")).trim().isEmpty()) {
            throw new IllegalArgumentException("clientCert is required for gRPC configuration");
        }
        if (!data.containsKey("clientKey") || data.get("clientKey") == null || 
            !(data.get("clientKey") instanceof String) || ((String) data.get("clientKey")).trim().isEmpty()) {
            throw new IllegalArgumentException("clientKey is required for gRPC configuration");
        }
        
        // Validate timeouts if provided
        if (data.containsKey("callTimeoutMs")) {
            Object timeoutObj = data.get("callTimeoutMs");
            if (timeoutObj instanceof Number) {
                long timeout = ((Number) timeoutObj).longValue();
                if (timeout < 1000) {
                    throw new IllegalArgumentException("callTimeoutMs must be at least 1000ms");
                }
            }
        }
        if (data.containsKey("availabilitySlaMs")) {
            Object timeoutObj = data.get("availabilitySlaMs");
            if (timeoutObj instanceof Number) {
                long timeout = ((Number) timeoutObj).longValue();
                if (timeout < 1000) {
                    throw new IllegalArgumentException("availabilitySlaMs must be at least 1000ms");
                }
            }
        }
        if (data.containsKey("longPollWaitMs")) {
            Object timeoutObj = data.get("longPollWaitMs");
            if (timeoutObj instanceof Number) {
                long timeout = ((Number) timeoutObj).longValue();
                if (timeout < 1000) {
                    throw new IllegalArgumentException("longPollWaitMs must be at least 1000ms");
                }
            }
        }
        
        return new Config(true, data);
    }

    public static Config forRest(Map<String, Object> data) {
        // Validation
        if (!data.containsKey("baseUrl") || data.get("baseUrl") == null || 
            !(data.get("baseUrl") instanceof String) || ((String) data.get("baseUrl")).trim().isEmpty()) {
            throw new IllegalArgumentException("baseUrl is required for REST configuration");
        }
        if (!data.containsKey("token") || data.get("token") == null || 
            !(data.get("token") instanceof String) || ((String) data.get("token")).trim().isEmpty()) {
            throw new IllegalArgumentException("token is required for REST configuration");
        }
        
        // Validate timeouts if provided
        if (data.containsKey("callTimeoutMs")) {
            Object timeoutObj = data.get("callTimeoutMs");
            if (timeoutObj instanceof Number) {
                long timeout = ((Number) timeoutObj).longValue();
                if (timeout < 1000) {
                    throw new IllegalArgumentException("callTimeoutMs must be at least 1000ms");
                }
            }
        }
        if (data.containsKey("availabilitySlaMs")) {
            Object timeoutObj = data.get("availabilitySlaMs");
            if (timeoutObj instanceof Number) {
                long timeout = ((Number) timeoutObj).longValue();
                if (timeout < 1000) {
                    throw new IllegalArgumentException("availabilitySlaMs must be at least 1000ms");
                }
            }
        }
        if (data.containsKey("longPollWaitMs")) {
            Object timeoutObj = data.get("longPollWaitMs");
            if (timeoutObj instanceof Number) {
                long timeout = ((Number) timeoutObj).longValue();
                if (timeout < 1000) {
                    throw new IllegalArgumentException("longPollWaitMs must be at least 1000ms");
                }
            }
        }
        
        return new Config(false, data);
    }

    public boolean isGrpc() {
        return grpc;
    }

    @SuppressWarnings("unchecked")
    public <T> T get(String key, T defaultValue) {
        return (T) data.getOrDefault(key, defaultValue);
    }

    public Config withCorrelationId(String correlationId) {
        Map<String, Object> newData = new HashMap<>(this.data);
        newData.put("correlationId", correlationId);
        return new Config(this.grpc, newData);
    }
}

