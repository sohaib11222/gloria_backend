export interface AvailabilityChunkData {
  items: unknown[];
  status: string;
  cursor?: number;
  [key: string]: unknown;
}

export class AvailabilityChunk {
  public readonly items: unknown[];
  public readonly status: string;
  public readonly cursor: number | null;
  public readonly raw: AvailabilityChunkData;

  private constructor(
    items: unknown[],
    status: string,
    cursor: number | null,
    raw: AvailabilityChunkData
  ) {
    this.items = items;
    this.status = status;
    this.cursor = cursor;
    this.raw = raw;
  }

  public static fromArray(data: AvailabilityChunkData): AvailabilityChunk {
    return new AvailabilityChunk(
      data.items || [],
      data.status || 'PARTIAL',
      data.cursor !== undefined ? Number(data.cursor) : null,
      data
    );
  }
}

