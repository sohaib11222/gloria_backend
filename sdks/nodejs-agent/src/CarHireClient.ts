import { Config } from './Config';
import { AvailabilityClient } from './clients/AvailabilityClient';
import { BookingClient } from './clients/BookingClient';
import { LocationsClient } from './clients/LocationsClient';
import { GrpcTransport } from './transport/GrpcTransport';
import { RestTransport } from './transport/RestTransport';
import { TransportInterface } from './transport/TransportInterface';

export class CarHireClient {
  private readonly transport: TransportInterface;
  private readonly availability: AvailabilityClient;
  private readonly booking: BookingClient;
  private readonly locations: LocationsClient;

  constructor(private readonly config: Config) {
    this.transport = config.isGrpc()
      ? new GrpcTransport(config)
      : new RestTransport(config);

    this.availability = new AvailabilityClient(this.transport, this.config);
    this.booking = new BookingClient(this.transport, this.config);
    this.locations = new LocationsClient(this.transport, this.config);
  }

  public getAvailability(): AvailabilityClient {
    return this.availability;
  }

  public getBooking(): BookingClient {
    return this.booking;
  }

  public getLocations(): LocationsClient {
    return this.locations;
  }

  public getTransport(): TransportInterface {
    return this.transport;
  }
}

