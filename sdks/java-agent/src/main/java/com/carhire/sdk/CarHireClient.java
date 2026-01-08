package com.carhire.sdk;

import com.carhire.sdk.clients.AvailabilityClient;
import com.carhire.sdk.clients.BookingClient;
import com.carhire.sdk.clients.LocationsClient;
import com.carhire.sdk.transport.GrpcTransport;
import com.carhire.sdk.transport.RestTransport;
import com.carhire.sdk.transport.TransportInterface;

public class CarHireClient {
    private final Config config;
    private final TransportInterface transport;
    private final AvailabilityClient availability;
    private final BookingClient booking;
    private final LocationsClient locations;

    public CarHireClient(Config config) {
        this.config = config;
        this.transport = config.isGrpc()
            ? new GrpcTransport(config)
            : new RestTransport(config);
        this.availability = new AvailabilityClient(this.transport, this.config);
        this.booking = new BookingClient(this.transport, this.config);
        this.locations = new LocationsClient(this.transport, this.config);
    }

    public AvailabilityClient getAvailability() {
        return availability;
    }

    public BookingClient getBooking() {
        return booking;
    }

    public LocationsClient getLocations() {
        return locations;
    }

    public TransportInterface getTransport() {
        return transport;
    }
}

