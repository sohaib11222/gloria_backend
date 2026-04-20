/**
 * gRPC gateway: exposes ClientSupplierService to Gloria aggregator.
 * Forwards each RPC to Laravel JSON routes (PHP OTA adapter). No XML here.
 */
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import axios, { AxiosError } from "axios";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, "../../proto/gloria_client_supplier.proto");

const LARAVEL_BASE = (process.env.LARAVEL_HTTP_BASE || "http://127.0.0.1:8000").replace(/\/$/, "");
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 30000);
const GRPC_PORT = process.env.GLORA_CLIENT_GRPC_PORT || "50061";

function loadProto() {
  const def = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(def) as any;
}

function mapAxiosError(e: unknown): grpc.ServiceError {
  const err = new Error() as grpc.ServiceError;
  err.code = grpc.status.INTERNAL;
  err.message = e instanceof Error ? e.message : String(e);
  if (axios.isAxiosError(e)) {
    const ax = e as AxiosError;
    err.message = ax.message;
    if (ax.code === "ECONNABORTED" || ax.code === "ETIMEDOUT") {
      err.code = grpc.status.DEADLINE_EXCEEDED;
    } else if (ax.response?.status === 502) {
      err.code = grpc.status.FAILED_PRECONDITION;
    } else if (!ax.response) {
      err.code = grpc.status.UNAVAILABLE;
    }
  }
  return err;
}

const http = axios.create({
  baseURL: LARAVEL_BASE,
  timeout: HTTP_TIMEOUT_MS,
  validateStatus: () => true,
});

async function main() {
  const pkg = loadProto();
  const supplierNs = pkg["gloria.client.supplier"] || pkg.gloria?.client?.supplier;
  if (!supplierNs?.ClientSupplierService) {
    throw new Error("Could not load gloria.client.supplier.ClientSupplierService from proto");
  }
  const ServerCtor = supplierNs.ClientSupplierService;

  const impl = {
    GetBranches: async (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
      try {
        const res = await http.get("/glora/branches", { params: call.request?.metadata || {} });
        if (res.status >= 400) {
          cb(mapAxiosError(Object.assign(new Error(res.data?.message || "HTTP " + res.status), { response: res })));
          return;
        }
        const d = res.data;
        cb(null, {
          success: !!d.success,
          error: d.success ? undefined : { code: d.error || "SUPPLIER_HTTP", message: d.message || "" },
          branches: (d.branches || []).map((b: any) => ({
            id: String(b.id ?? ""),
            name: String(b.name ?? ""),
            city: String(b.city ?? ""),
          })),
          metadata: {},
        });
      } catch (e) {
        cb(mapAxiosError(e));
      }
    },

    SearchCars: async (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
      try {
        const r = call.request || {};
        const res = await http.post("/glora/search", {
          pickup_unlocode: r.pickup_unlocode,
          dropoff_unlocode: r.dropoff_unlocode,
          pickup_iso: r.pickup_iso,
          dropoff_iso: r.dropoff_iso,
          driver_age: r.driver_age,
          residency_country: r.residency_country,
        });
        if (res.status >= 400) {
          const msg = (res.data as any)?.message || `HTTP ${res.status}`;
          const err = new Error(msg) as grpc.ServiceError;
          err.code =
            res.status === 502 ? grpc.status.FAILED_PRECONDITION : grpc.status.INTERNAL;
          cb(err);
          return;
        }
        const d = res.data;
        cb(null, {
          success: !!d.success,
          error: d.success ? undefined : { code: d.error || "SUPPLIER_HTTP", message: d.message || "" },
          cars: (d.cars || []).map((c: any) => ({
            id: String(c.id ?? ""),
            name: String(c.name ?? ""),
            price: Number(c.price ?? 0),
            currency: String(c.currency ?? ""),
          })),
          metadata: {},
        });
      } catch (e) {
        cb(mapAxiosError(e));
      }
    },

    BookCar: async (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
      try {
        const r = call.request || {};
        const res = await http.post("/glora/book", {
          agent_id: r.agent_id,
          agreement_ref: r.agreement_ref,
          supplier_offer_ref: r.supplier_offer_ref,
          agent_booking_ref: r.agent_booking_ref,
          pickup_unlocode: r.pickup_unlocode,
          dropoff_unlocode: r.dropoff_unlocode,
          pickup_iso: r.pickup_iso,
          dropoff_iso: r.dropoff_iso,
          vehicle_class: r.vehicle_class,
        });
        const d = res.data;
        if (res.status >= 400 || !d.success) {
          cb(null, {
            success: false,
            error: { code: d.error || "SUPPLIER_HTTP", message: d.message || "" },
            metadata: {},
          });
          return;
        }
        cb(null, {
          success: true,
          booking: {
            reservation_id: String(d.booking?.reservation_id ?? ""),
            status: String(d.booking?.status ?? ""),
          },
          metadata: {},
        });
      } catch (e) {
        cb(mapAxiosError(e));
      }
    },

    CancelBooking: async (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
      try {
        const r = call.request || {};
        const res = await http.post("/glora/cancel", {
          reservation_id: r.reservation_id,
          agreement_ref: r.agreement_ref,
        });
        const d = res.data;
        if (res.status >= 400 || !d.success) {
          cb(null, {
            success: false,
            error: { code: d.error || "SUPPLIER_HTTP", message: d.message || "" },
            metadata: {},
          });
          return;
        }
        cb(null, {
          success: true,
          booking: {
            reservation_id: String(d.booking?.reservation_id ?? ""),
            status: String(d.booking?.status ?? ""),
          },
          metadata: {},
        });
      } catch (e) {
        cb(mapAxiosError(e));
      }
    },

    GetBooking: async (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
      try {
        const r = call.request || {};
        const res = await http.post("/glora/status", {
          reservation_id: r.reservation_id,
          agreement_ref: r.agreement_ref,
        });
        const d = res.data;
        if (res.status >= 400 || !d.success) {
          cb(null, {
            success: false,
            error: { code: d.error || "SUPPLIER_HTTP", message: d.message || "" },
            metadata: {},
          });
          return;
        }
        cb(null, {
          success: true,
          booking: {
            reservation_id: String(d.booking?.reservation_id ?? ""),
            status: String(d.booking?.status ?? ""),
          },
          metadata: {},
        });
      } catch (e) {
        cb(mapAxiosError(e));
      }
    },
  };

  const server = new grpc.Server();
  server.addService(ServerCtor.service, impl);
  const addr = `0.0.0.0:${GRPC_PORT}`;
  server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    server.start();
    console.log(`[gloria-client-wrapper] gRPC listening ${addr} -> HTTP ${LARAVEL_BASE}`);
  });

  const shutdown = () => {
    server.tryShutdown(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
