import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const P = "src/grpc/proto/supplier.proto";

function loadPkg() {
  const def = protoLoader.loadSync(P, {
    keepCase: true,            // 👈 keep snake_case from .proto
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  return grpc.loadPackageDefinition(def);
}

export function makeSupplierClient(endpoint: string): any {
  const pkg = loadPkg();
  const Client = (pkg as any).supplier.SupplierService;
  const client = new Client(endpoint, grpc.credentials.createInsecure());
  return client;
}

export function metaWithAuth(apiKeyOrJwt: string): grpc.Metadata {
  const md = new grpc.Metadata();
  if (apiKeyOrJwt) md.set("authorization", String(apiKeyOrJwt)); // e.g., 'Bearer <token>' or 'ApiKey <key>'
  return md;
}
