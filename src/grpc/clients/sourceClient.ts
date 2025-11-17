import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolveProtoPath } from "../util/resolveProtoPath.js";

export function makeSourceGrpcClient(address: string) {
  const { path: protoPath, tried } = resolveProtoPath(
    "source_provider.proto",
    process.env.SOURCE_PROVIDER_PROTO_PATH
  );
  if (!protoPath) {
    const hint = [
      "Unable to locate source_provider.proto.",
      "Set env SOURCE_PROVIDER_PROTO_PATH to the full file path, or place the file in one of:",
      "- <repo-root>/protos/source_provider.proto",
      "- <middleware-backend>/protos/source_provider.proto",
      `Tried: ${tried.join(" | ")}`
    ].join("\n");
    throw new Error(hint);
  }

  const def = protoLoader.loadSync(protoPath, { 
    keepCase: true, 
    longs: String, 
    enums: String, 
    defaults: true, 
    oneofs: true 
  });
  // @ts-ignore
  const { SourceProviderService } = grpc.loadPackageDefinition(def).source_provider;
  return new SourceProviderService(address, grpc.credentials.createInsecure());
}

export const srcProm = (client: any, method: string, req: any = {}) =>
  new Promise((res, rej) => client[method](req, (e: any, r: any) => e ? rej(e) : res(r)));
