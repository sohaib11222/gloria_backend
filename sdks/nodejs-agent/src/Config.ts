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
    return new Config(true, data);
  }

  public static forRest(data: ConfigData): Config {
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

