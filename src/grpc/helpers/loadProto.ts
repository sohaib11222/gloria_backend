import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load a proto file and return the loaded package
 * @param protoPath - Path to the proto file relative to project root
 * @param packageName - Optional package name to extract from the loaded proto
 * @returns Loaded gRPC package
 */
export function loadProto(protoPath: string, packageName?: string) {
  const protoFilePath = path.resolve(__dirname, '../../../', protoPath);
  
  const packageDefinition = protoLoader.loadSync(protoFilePath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [path.resolve(__dirname, '../../../protos')]
  });

  const loadedPackage = grpc.loadPackageDefinition(packageDefinition);
  
  if (packageName) {
    return loadedPackage[packageName];
  }
  
  return loadedPackage;
}

/**
 * Create a gRPC client for a service
 * @param service - The service constructor from loaded proto
 * @param address - Server address (e.g., "localhost:50051")
 * @param credentials - Optional credentials (defaults to insecure)
 * @returns gRPC client instance
 */
export function createGrpcClient(service: any, address: string, credentials?: grpc.ChannelCredentials) {
  const creds = credentials || grpc.credentials.createInsecure();
  return new service(address, creds);
}
