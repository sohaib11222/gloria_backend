export interface ConfigData {
  baseUrl?: string;
  token?: string;
  apiKey?: string;
  agentId?: string;
  callTimeoutMs?: number;
  availabilitySlaMs?: number;
  longPollWaitMs?: number;
  correlationId?: string;
  // gRPC specific
  host?: string;
  caCert?: string;
  clientCert?: string;
  clientKey?: string;
}

export class Config {
  private readonly grpc: boolean;
  private readonly data: Required<ConfigData>;

  private constructor(grpc: boolean, data: ConfigData) {
    this.grpc = grpc;
    const defaults: Required<ConfigData> = {
      baseUrl: '',
      token: '',
      apiKey: '',
      agentId: '',
      callTimeoutMs: 10000,
      availabilitySlaMs: 120000,
      longPollWaitMs: 10000,
      correlationId: `nodejs-sdk-${Buffer.from(Math.random().toString()).toString('hex').substring(0, 12)}`,
      host: '',
      caCert: '',
      clientCert: '',
      clientKey: '',
      ...data,
    };
    this.data = defaults;
  }

  public static forGrpc(data: ConfigData): Config {
    // Validation
    if (!data.host || data.host.trim().length === 0) {
      throw new Error('host is required for gRPC configuration');
    }
    // Certificates are optional - if not provided, uses insecure connection (matches backend default)
    // Token is required for authentication
    if (!data.token || data.token.trim().length === 0) {
      throw new Error('token is required for gRPC configuration (used for Bearer authentication)');
    }
    if (data.callTimeoutMs !== undefined && data.callTimeoutMs < 1000) {
      throw new Error('callTimeoutMs must be at least 1000ms');
    }
    if (data.availabilitySlaMs !== undefined && data.availabilitySlaMs < 1000) {
      throw new Error('availabilitySlaMs must be at least 1000ms');
    }
    if (data.longPollWaitMs !== undefined && data.longPollWaitMs < 1000) {
      throw new Error('longPollWaitMs must be at least 1000ms');
    }
    return new Config(true, data);
  }

  public static forRest(data: ConfigData): Config {
    // Validation
    if (!data.baseUrl || data.baseUrl.trim().length === 0) {
      throw new Error('baseUrl is required for REST configuration');
    }
    if (!data.token || data.token.trim().length === 0) {
      throw new Error('token is required for REST configuration');
    }
    if (data.callTimeoutMs !== undefined && data.callTimeoutMs < 1000) {
      throw new Error('callTimeoutMs must be at least 1000ms');
    }
    if (data.availabilitySlaMs !== undefined && data.availabilitySlaMs < 1000) {
      throw new Error('availabilitySlaMs must be at least 1000ms');
    }
    if (data.longPollWaitMs !== undefined && data.longPollWaitMs < 1000) {
      throw new Error('longPollWaitMs must be at least 1000ms');
    }
    return new Config(false, data);
  }

  public isGrpc(): boolean {
    return this.grpc;
  }

  public get<K extends keyof ConfigData>(key: K): ConfigData[K] {
    return this.data[key];
  }

  public withCorrelationId(id: string): Config {
    return new Config(this.grpc, { ...this.data, correlationId: id });
  }
}

