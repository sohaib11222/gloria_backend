// In-process adapters registry; later you can swap to out-of-process gRPC adapters.
// OTA-style field names for easier mapping.

export interface AvailabilityCriteria {
  pickup_unlocode: string;
  dropoff_unlocode: string;
  pickup_iso: string;
  dropoff_iso: string;
  driver_age: number;
  residency_country: string;
  vehicle_classes: string[];
  agreement_ref: string;
}

export interface Offer {
  source_id: string;
  agreement_ref: string;
  vehicle_class: string;
  vehicle_make_model: string;
  rate_plan_code: string;
  currency: string;
  total_price: number;
  supplier_offer_ref: string;
  availability_status?: string; // AVAILABLE, ON_REQUEST, etc.
}

export interface CreateBookingInput {
  agreement_ref: string;
  supplier_offer_ref: string;
  agent_booking_ref?: string;
  driver?: { first_name?: string; last_name?: string; email?: string; phone?: string };
  // payment tokens etc. omitted for MVP
}

export interface BookingRecord {
  supplier_booking_ref: string;
  status: "REQUESTED" | "CONFIRMED" | "CANCELLED" | "FAILED";
  agreement_ref: string;
  supplier_offer_ref: string;
}

export interface ModifyBookingInput {
  supplier_booking_ref: string;
  agreement_ref: string; // Required: agreement_ref must be sent to source on every call
  // e.g., change dropoff time or extras; omitted for mock
}

export interface EchoResponse {
  echoedMessage: string;
  echoedAttrs: Record<string, string>;
}

export interface SourceAdapter {
  locations(): Promise<string[]>;
  availability(criteria: AvailabilityCriteria): Promise<Offer[]>;

  bookingCreate(input: CreateBookingInput): Promise<BookingRecord>;
  bookingModify(input: ModifyBookingInput): Promise<BookingRecord>;
  bookingCancel(ref: string, agreement_ref: string): Promise<BookingRecord>;
  bookingCheck(ref: string, agreement_ref: string): Promise<BookingRecord>;
  
  echo?(message: string, attrs: Record<string, string>): Promise<EchoResponse>;
}

class MockAdapter implements SourceAdapter {
  private bookings = new Map<string, BookingRecord>();

  async locations(): Promise<string[]> {
    return ["GBMAN", "GBGLA", "FRPAR"];
  }

  async availability(c: AvailabilityCriteria): Promise<Offer[]> {
    const base = c.agreement_ref.length + c.pickup_unlocode.length;
    const mk = (n: number) => ({
      source_id: "MOCK-SOURCE",
      agreement_ref: c.agreement_ref,
      vehicle_class: ["ECMN", "CDMR", "IFAR"][n % 3],
      vehicle_make_model: ["Toyota Yaris", "VW Golf", "Nissan Qashqai"][n % 3],
      rate_plan_code: ["BAR", "MEMBER", "PREPAY"][n % 3],
      currency: "USD",
      total_price: Math.round((19 + base + n * 7 + (c.driver_age - 21)) * 100) / 100,
      supplier_offer_ref: `MOCK-${c.agreement_ref}-${c.pickup_unlocode}-${n}`,
      availability_status: "AVAILABLE"
    });
    return [mk(0), mk(1), mk(2)];
  }

  async bookingCreate(input: CreateBookingInput): Promise<BookingRecord> {
    const supplier_booking_ref = `BKG-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const rec: BookingRecord = {
      supplier_booking_ref,
      status: "CONFIRMED",
      agreement_ref: input.agreement_ref,
      supplier_offer_ref: input.supplier_offer_ref
    };
    this.bookings.set(supplier_booking_ref, rec);
    return rec;
  }

  async bookingModify(input: ModifyBookingInput): Promise<BookingRecord> {
    const rec = this.bookings.get(input.supplier_booking_ref);
    if (!rec) throw new Error("NOT_FOUND");
    // Mock: toggles to CONFIRMED
    rec.status = "CONFIRMED";
    rec.agreement_ref = input.agreement_ref; // Ensure agreement_ref is set
    this.bookings.set(rec.supplier_booking_ref, rec);
    return rec;
  }

  async bookingCancel(ref: string, agreement_ref: string): Promise<BookingRecord> {
    const rec = this.bookings.get(ref);
    if (!rec) throw new Error("NOT_FOUND");
    rec.status = "CANCELLED";
    rec.agreement_ref = agreement_ref; // Ensure agreement_ref is set
    this.bookings.set(ref, rec);
    return rec;
  }

  async bookingCheck(ref: string, agreement_ref: string): Promise<BookingRecord> {
    const rec = this.bookings.get(ref);
    if (!rec) throw new Error("NOT_FOUND");
    rec.agreement_ref = agreement_ref; // Ensure agreement_ref is set
    return rec;
  }

  async echo(message: string, attrs: Record<string, string>): Promise<EchoResponse> {
    // Mock adapter simply echoes back the message and attributes
    return {
      echoedMessage: message,
      echoedAttrs: attrs,
    };
  }
}

import { prisma } from "../data/prisma.js";
import { makeGrpcSourceAdapter } from "./grpcSourceAdapter.js";

// Lazy import to avoid circular deps in TS build if any
async function loadGrpcAdapter() {
  const mod = await import("./grpc.adapter.js");
  return mod.GrpcAdapter;
}

export async function getAdapterForSource(sourceId: string): Promise<SourceAdapter> {
  console.log(`[AdapterRegistry] 🔍 Getting adapter for source: ${sourceId}`);
  console.log(`[AdapterRegistry] 📋 Querying source company from database...`);
  
  const src = await prisma.company.findUnique({ where: { id: sourceId } });
  
  if (!src) {
    console.error(`[AdapterRegistry] ❌ Source ${sourceId} not found in database`);
    throw new Error("SOURCE_NOT_FOUND");
  }
  
  console.log(`[AdapterRegistry] 📊 Source company found:`, {
    id: src.id,
    adapterType: src.adapterType,
    grpcEndpoint: src.grpcEndpoint,
    httpEndpoint: src.httpEndpoint,
    use_grpc: (src as any).use_grpc,
    api_base_url: (src as any).api_base_url
  });

  // Check for gRPC usage (real gRPC protocol)
  const useGrpc = (src as any).use_grpc === true;
  console.log(`[AdapterRegistry] 🔍 Checking gRPC flags: use_grpc=${useGrpc}`);
  
  // Detect from api_base_url: grpc://host:port → extract address
  let grpcAddr: string | null = null;
  if (typeof (src as any).api_base_url === "string" && (src as any).api_base_url.startsWith("grpc://")) {
    grpcAddr = (src as any).api_base_url.replace("grpc://", "");
    console.log(`[AdapterRegistry] 📍 Found grpc:// in api_base_url: ${grpcAddr}`);
  }
  
  // Also check grpcEndpoint for grpc:// prefix (workaround since api_base_url might not exist in schema)
  if (!grpcAddr && src.grpcEndpoint && src.grpcEndpoint.startsWith("grpc://")) {
    grpcAddr = src.grpcEndpoint.replace("grpc://", "");
    console.log(`[AdapterRegistry] 📍 Found grpc:// prefix in grpcEndpoint, extracted: ${grpcAddr}`);
  }
  
  // If grpcEndpoint is just host:port (no protocol), assume it's gRPC (not HTTP)
  // This is the most common case for gRPC servers
  if (!grpcAddr && src.grpcEndpoint && !src.grpcEndpoint.startsWith("http://") && !src.grpcEndpoint.startsWith("https://")) {
    grpcAddr = src.grpcEndpoint;
    console.log(`[AdapterRegistry] 📍 grpcEndpoint is host:port format (no protocol), assuming gRPC: ${grpcAddr}`);
  } else if (src.grpcEndpoint && (src.grpcEndpoint.startsWith("http://") || src.grpcEndpoint.startsWith("https://"))) {
    console.log(`[AdapterRegistry] ⚠️ grpcEndpoint has http/https protocol: ${src.grpcEndpoint}`);
  }

  if (useGrpc || grpcAddr) {
    const addr = grpcAddr || `${(src as any).grpc_host || "localhost"}:${(src as any).grpc_port || 50061}`;
    console.log(`[AdapterRegistry] ✅ Selected: gRPC adapter (real gRPC protocol) for source ${sourceId} at ${addr}`);
    console.log(`[AdapterRegistry] 🔧 Creating GrpcSourceAdapter instance...`);
    return makeGrpcSourceAdapter(addr) as any;
  }

  // HTTP-based adapter (confusingly named "GrpcAdapter" but it's HTTP REST)
  // Only use this if grpcEndpoint explicitly has http:// or https://
  if (src.adapterType === "grpc" && src.grpcEndpoint && (src.grpcEndpoint.startsWith("http://") || src.grpcEndpoint.startsWith("https://"))) {
    const GrpcAdapter = await loadGrpcAdapter();
    console.log(`[AdapterRegistry] ✅ Selected: HTTP adapter (GrpcAdapter) for source ${sourceId} at ${src.grpcEndpoint}`);
    return new GrpcAdapter({ endpoint: src.grpcEndpoint, authHeader: process.env.SUPPLIER_GRPC_AUTH || "", sourceId });
  }

  // Check if adapterType is explicitly set to "mock"
  if (src.adapterType === "mock") {
    const isProduction = process.env.NODE_ENV === "production";
    const allowMockInProduction = process.env.ALLOW_MOCK_ADAPTER_IN_PRODUCTION === "true";
    
    if (isProduction && !allowMockInProduction) {
      console.error(`[AdapterRegistry] ❌ BLOCKED: Mock adapter cannot be used in production for source ${sourceId}`);
      throw new Error("MOCK_ADAPTER_NOT_ALLOWED_IN_PRODUCTION");
    }
    
    console.warn(`[AdapterRegistry] ⚠️ WARNING: Using MOCK adapter for source ${sourceId} (TEST-ONLY)`);
    console.warn(`[AdapterRegistry] ⚠️ Source: ${src.companyName} (${src.id})`);
    console.warn(`[AdapterRegistry] ⚠️ This adapter returns fake data and should only be used for testing`);
    return new MockAdapter();
  }

  // If adapterType is null/undefined and no gRPC endpoint configured, throw error
  if (!src.adapterType && !grpcAddr && !src.grpcEndpoint) {
    console.error(`[AdapterRegistry] ❌ ERROR: Source ${sourceId} has no adapter configured`);
    console.error(`[AdapterRegistry] ❌ Source must have adapterType set to "grpc" or "http", or configure grpcEndpoint`);
    throw new Error("ADAPTER_NOT_CONFIGURED");
  }

  // Fallback to mock only if explicitly allowed (should not happen in normal flow)
  console.warn(`[AdapterRegistry] ⚠️ WARNING: Falling back to Mock adapter for source ${sourceId} - this should not happen`);
  console.warn(`[AdapterRegistry] ⚠️ Source configuration: adapterType=${src.adapterType}, grpcEndpoint=${src.grpcEndpoint}`);
  return new MockAdapter();
}

/**
 * Check if a source is using a mock adapter
 * @param sourceId The source company ID
 * @returns true if the source uses a mock adapter, false otherwise
 */
export async function isSourceUsingMockAdapter(sourceId: string): Promise<boolean> {
  try {
    const src = await prisma.company.findUnique({ 
      where: { id: sourceId },
      select: { adapterType: true }
    });
    return src?.adapterType === "mock";
  } catch (error) {
    console.error(`[AdapterRegistry] Error checking mock adapter for source ${sourceId}:`, error);
    return false;
  }
}
