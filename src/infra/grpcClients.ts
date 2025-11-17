import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import fs from "fs";
import { logger } from "./logger";

/* global __dirname */

export interface GrpcClientConfig {
  address: string;
  timeout?: number;
}

export interface HealthCheckResult {
  status: number;
  service: string;
}

export function loadProto(protoPath: string) {
  const pkgDef = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(pkgDef);
}

export function createDeadline(timeoutMs: number = 3000): Date {
  const deadline = new Date();
  deadline.setMilliseconds(deadline.getMilliseconds() + timeoutMs);
  return deadline;
}

function createClientCredentials(): grpc.ChannelCredentials {
  const tlsEnabled = process.env.GRPC_TLS_ENABLED === "true";

  if (!tlsEnabled) {
    return grpc.credentials.createInsecure();
  }

  try {
    const caCert = fs.readFileSync(process.env.GRPC_TLS_CA || "./certs/ca.pem");
    const clientCert = fs.readFileSync(
      process.env.GRPC_TLS_CERT || "./certs/client.pem"
    );
    const clientKey = fs.readFileSync(
      process.env.GRPC_TLS_KEY || "./certs/client.key"
    );

    return grpc.credentials.createSsl(caCert, clientKey, clientCert);
  } catch (error) {
    logger.error(
      { error: error.message },
      "Failed to load TLS certificates, falling back to insecure"
    );
    return grpc.credentials.createInsecure();
  }
}

export function createHealthClient(address: string) {
  try {
    const healthProto = loadProto(
      path.resolve(process.cwd(), "src/grpc/proto/health.proto")
    );
    const healthPkg = (healthProto as any).grpc?.health?.v1;

    if (!healthPkg?.Health) {
      throw new Error("Health service not available in proto");
    }

    const client = new healthPkg.Health(address, createClientCredentials());

    return {
      check(
        service: string = "",
        timeoutMs: number = 3000
      ): Promise<HealthCheckResult> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.Check({ service }, { deadline }, (err: any, response: any) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
        });
      },
    };
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to create health client");
    throw error;
  }
}

export function createSourceClient(address: string) {
  try {
    const sourceProto = loadProto(
      path.resolve(process.cwd(), "protos/source_provider.proto")
    );
    const sourcePkg = (sourceProto as any).source_provider;

    if (!sourcePkg?.SourceProviderService) {
      throw new Error("SourceProviderService not available in proto");
    }

    const client = new sourcePkg.SourceProviderService(
      address,
      createClientCredentials()
    );

    return {
      getHealth(timeoutMs: number = 3000): Promise<any> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.GetHealth({}, { deadline }, (err: any, response: any) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
        });
      },

      getLocations(timeoutMs: number = 3000): Promise<any> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.GetLocations({}, { deadline }, (err: any, response: any) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
        });
      },

      getAvailability(request: any, timeoutMs: number = 10000): Promise<any> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.GetAvailability(
            request,
            { deadline },
            (err: any, response: any) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(response);
            }
          );
        });
      },

      createBooking(request: any, timeoutMs: number = 10000): Promise<any> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.CreateBooking(
            request,
            { deadline },
            (err: any, response: any) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(response);
            }
          );
        });
      },

      modifyBooking(request: any, timeoutMs: number = 10000): Promise<any> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.ModifyBooking(
            request,
            { deadline },
            (err: any, response: any) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(response);
            }
          );
        });
      },

      cancelBooking(request: any, timeoutMs: number = 10000): Promise<any> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.CancelBooking(
            request,
            { deadline },
            (err: any, response: any) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(response);
            }
          );
        });
      },

      checkBooking(request: any, timeoutMs: number = 10000): Promise<any> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.CheckBooking(
            request,
            { deadline },
            (err: any, response: any) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(response);
            }
          );
        });
      },
    };
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to create source client");
    throw error;
  }
}

export function createAgentClient(address: string) {
  try {
    const agentProto = loadProto(
      path.resolve(process.cwd(), "protos/agent_tester.proto")
    );
    const agentPkg = (agentProto as any).carhire?.agent?.v1;

    if (!agentPkg?.AgentTesterService) {
      throw new Error("AgentTesterService not available in proto");
    }

    const client = new agentPkg.AgentTesterService(
      address,
      createClientCredentials()
    );

    return {
      getHealth(timeoutMs: number = 3000): Promise<any> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.GetHealth({}, { deadline }, (err: any, response: any) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
        });
      },

      runSearch(request: any, timeoutMs: number = 10000): Promise<any> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.RunSearch(request, { deadline }, (err: any, response: any) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
        });
      },

      runBook(request: any, timeoutMs: number = 10000): Promise<any> {
        return new Promise((resolve, reject) => {
          const deadline = createDeadline(timeoutMs);
          client.RunBook(request, { deadline }, (err: any, response: any) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
        });
      },
    };
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to create agent client");
    throw error;
  }
}
