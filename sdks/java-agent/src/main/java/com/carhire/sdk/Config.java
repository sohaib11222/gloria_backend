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
        return new Config(true, data);
    }

    public static Config forRest(Map<String, Object> data) {
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

