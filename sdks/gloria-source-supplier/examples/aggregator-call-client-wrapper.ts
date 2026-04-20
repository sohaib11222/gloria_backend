/**
 * Example: Gloria aggregator (or any Node process) calling the client-side gRPC wrapper.
 * Run the wrapper: cd packages/gloria-client-supplier/node-wrapper && npm run build && npm start
 *
 * Usage: npx tsx examples/aggregator-call-client-wrapper.ts
 */
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO = path.resolve(__dirname, "../proto/gloria_client_supplier.proto");
const TARGET = process.env.GLORA_CLIENT_WRAPPER_ADDR || "127.0.0.1:50061";

function loadClient() {
  const def = protoLoader.loadSync(PROTO, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const pkg = grpc.loadPackageDefinition(def) as any;
  const ns = pkg["gloria.client.supplier"];
  const Ctor = ns.ClientSupplierService;
  return new Ctor(TARGET, grpc.credentials.createInsecure());
}

async function main() {
  const client = loadClient() as any;
  await new Promise<void>((resolve, reject) => {
    client.SearchCars(
      {
        pickup_unlocode: "DXBA02",
        dropoff_unlocode: "DXBA02",
        pickup_iso: "2026-02-22T12:00:00",
        dropoff_iso: "2026-02-27T12:00:00",
        driver_age: 30,
        residency_country: "AE",
        metadata: {},
      },
      (err: grpc.ServiceError | null, res: any) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(JSON.stringify(res, null, 2));
        resolve();
      }
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
