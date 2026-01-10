package com.carhire.sdk.clients;

import com.carhire.sdk.Config;
import com.carhire.sdk.transport.TransportInterface;

import java.util.concurrent.CompletableFuture;

public class LocationsClient {
    private final TransportInterface transport;
    private final Config config;

    public LocationsClient(TransportInterface transport, Config config) {
        this.transport = transport;
        this.config = config;
    }

    public CompletableFuture<Boolean> isSupported(String agreementRef, String locode) {
        return transport.isLocationSupported(agreementRef, locode);
    }
}

