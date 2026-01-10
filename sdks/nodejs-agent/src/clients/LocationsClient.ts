import { Config } from '../Config';
import { TransportInterface } from '../transport/TransportInterface';

export class LocationsClient {
  constructor(
    private readonly transport: TransportInterface,
    private readonly config: Config
  ) {}

  public async isSupported(agreementRef: string, locode: string): Promise<boolean> {
    return this.transport.isLocationSupported(agreementRef, locode);
  }
}

