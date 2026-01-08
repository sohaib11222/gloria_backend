import { Config } from '../Config';
import { TransportInterface } from '../transport/TransportInterface';
import { AvailabilityCriteria } from '../DTO/AvailabilityCriteria';
import { AvailabilityChunk } from '../DTO/AvailabilityChunk';

export class AvailabilityClient {
  constructor(
    private readonly transport: TransportInterface,
    private readonly config: Config
  ) {}

  public async *search(criteria: AvailabilityCriteria): AsyncGenerator<AvailabilityChunk> {
    const payload = criteria.toArray();
    if (!payload.agreement_refs || (Array.isArray(payload.agreement_refs) && payload.agreement_refs.length === 0)) {
      throw new Error('agreement_refs required');
    }

    const submit = await this.transport.availabilitySubmit(payload);
    const requestId = submit.request_id as string | undefined;
    if (!requestId) {
      return; // nothing to yield
    }

    let since = 0;
    const deadline = Date.now() + (this.config.get('availabilitySlaMs') || 120000);

    while (true) {
      const remaining = Math.max(0, deadline - Date.now());
      if (remaining <= 0) break;

      const wait = Math.min(this.config.get('longPollWaitMs') || 10000, remaining);
      const res = await this.transport.availabilityPoll(requestId, since, wait);

      const chunk = AvailabilityChunk.fromArray(res as AvailabilityChunk['raw']);
      since = chunk.cursor ?? since;

      yield chunk;
      if (chunk.status === 'COMPLETE') break;
    }
  }
}

