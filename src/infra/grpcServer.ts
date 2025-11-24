import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

export interface GrpcServerConfig {
  host: string;
  port: number;
  serviceName: string;
}

export interface GrpcServerResult {
  server: grpc.Server;
  boundAddr: string;
  boundPort: number;
}

export interface HealthService {
  setServing(serviceName: string, serving: boolean): void;
  getStatus(serviceName: string): number;
}

const SERVING = 1; // grpc.health.v1.HealthCheckResponse.ServingStatus.SERVING
const NOT_SERVING = 2; // grpc.health.v1.HealthCheckResponse.ServingStatus.NOT_SERVING

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

export function createHealthService(): HealthService {
  const statusMap = new Map<string, boolean>();
  
  return {
    setServing(serviceName: string, serving: boolean) {
      statusMap.set(serviceName, serving);
    },
    getStatus(serviceName: string): number {
      return statusMap.get(serviceName) ? SERVING : NOT_SERVING;
    }
  };
}

export function createServerCredentials(): grpc.ServerCredentials {
  const tlsEnabled = process.env.GRPC_TLS_ENABLED === 'true';
  
  if (!tlsEnabled) {
    return grpc.ServerCredentials.createInsecure();
  }
  
  try {
    const caCert = fs.readFileSync(process.env.GRPC_TLS_CA || './certs/ca.pem');
    const serverCert = fs.readFileSync(process.env.GRPC_TLS_CERT || './certs/server.pem');
    const serverKey = fs.readFileSync(process.env.GRPC_TLS_KEY || './certs/server.key');
    
    return grpc.ServerCredentials.createSsl(caCert, [
      {
        cert_chain: serverCert,
        private_key: serverKey
      }
    ], true);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to load TLS certificates, falling back to insecure');
    return grpc.ServerCredentials.createInsecure();
  }
}

export async function startGrpcServer(
  config: GrpcServerConfig,
  registerServices: (server: grpc.Server, health: HealthService) => void
): Promise<GrpcServerResult> {
  const server = new grpc.Server();
  const health = createHealthService();
  
  // Register business services
  registerServices(server, health);
  
  // Register health service
  try {
    const healthProto = loadProto(path.join(__dirname, '../grpc/proto/health.proto'));
    const healthPkg = healthProto.grpc?.health?.v1;
    
    if (healthPkg?.Health?.service) {
      server.addService(healthPkg.Health.service, {
        Check: (call: any, callback: any) => {
          const serviceName = call.request.service || '';
          const status = health.getStatus(serviceName);
          callback(null, { status });
        },
        Watch: (call: any) => {
          // Optional: implement streaming health checks
          // For now, just close the stream
          call.end();
        }
      });
    }
  } catch (error) {
    logger.warn({ error: error.message }, 'Failed to load health proto, health service disabled');
  }
  
  // Try binding with fallback logic for Windows EACCES issues
  const tryPorts = [config.port, config.port + 1, config.port + 2, config.port + 3];
  let currentHost = config.host;
  
  for (let i = 0; i < tryPorts.length; i++) {
    const port = tryPorts[i];
    const addr = `${currentHost}:${port}`;
    
    try {
      await new Promise<void>((resolve, reject) => {
        server.bindAsync(addr, createServerCredentials(), (err, boundPort) => {
          if (err) {
            reject(err);
            return;
          }
          if (!boundPort) {
            reject(new Error('No port bound'));
            return;
          }
          resolve();
        });
      });
      
      server.start();
      
      logger.info({
        service: config.serviceName,
        boundAddr: addr,
        boundPort: port,
        attempts: i + 1
      }, 'gRPC server started successfully');
      
      return {
        server,
        boundAddr: addr,
        boundPort: port
      };
    } catch (error: any) {
      logger.warn({
        service: config.serviceName,
        addr,
        error: error.message,
        attempt: i + 1
      }, 'gRPC bind attempt failed');
      
      // On EACCES with localhost/127.0.0.1, retry with 0.0.0.0 once before incrementing port
      if (currentHost === '127.0.0.1' || currentHost === 'localhost') {
        currentHost = '0.0.0.0';
        i--; // Retry same port with 0.0.0.0
        continue;
      }
      
      // If this was the last attempt, throw the error
      if (i === tryPorts.length - 1) {
        throw new Error(`Failed to bind gRPC server after ${tryPorts.length} attempts: ${error.message}`);
      }
    }
  }
  
  throw new Error('Failed to bind gRPC server: all attempts exhausted');
}

export function createGrpcHealthCheck(addr: string): Promise<{ status: number; service: string }> {
  return new Promise((resolve, reject) => {
    try {
      const healthProto = loadProto(path.join(__dirname, '../grpc/proto/health.proto'));
      const healthPkg = healthProto.grpc?.health?.v1;
      
      if (!healthPkg?.Health) {
        reject(new Error('Health service not available'));
        return;
      }
      
      // mTLS infrastructure available but disabled by default
      // To enable: set GRPC_TLS_ENABLED=true and use createClientCredentials()
      const client = new healthPkg.Health(addr, grpc.credentials.createInsecure());
      const deadline = new Date();
      deadline.setMilliseconds(deadline.getMilliseconds() + 3000);
      
      client.Check({ service: '' }, { deadline }, (err: any, response: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}
