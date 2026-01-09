// In-process adapters registry; later you can swap to out-of-process gRPC adapters.
// OTA-style field names for easier mapping.
class MockAdapter {
    bookings = new Map();
    async locations() {
        return ["GBMAN", "GBGLA", "FRPAR"];
    }
    async availability(c) {
        const base = c.agreement_ref.length + c.pickup_unlocode.length;
        const mk = (n) => ({
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
    async bookingCreate(input) {
        const supplier_booking_ref = `BKG-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
        const rec = {
            supplier_booking_ref,
            status: "CONFIRMED",
            agreement_ref: input.agreement_ref,
            supplier_offer_ref: input.supplier_offer_ref
        };
        this.bookings.set(supplier_booking_ref, rec);
        return rec;
    }
    async bookingModify(input) {
        const rec = this.bookings.get(input.supplier_booking_ref);
        if (!rec)
            throw new Error("NOT_FOUND");
        // Mock: toggles to CONFIRMED
        rec.status = "CONFIRMED";
        rec.agreement_ref = input.agreement_ref; // Ensure agreement_ref is set
        this.bookings.set(rec.supplier_booking_ref, rec);
        return rec;
    }
    async bookingCancel(ref, agreement_ref) {
        const rec = this.bookings.get(ref);
        if (!rec)
            throw new Error("NOT_FOUND");
        rec.status = "CANCELLED";
        rec.agreement_ref = agreement_ref; // Ensure agreement_ref is set
        this.bookings.set(ref, rec);
        return rec;
    }
    async bookingCheck(ref, agreement_ref) {
        const rec = this.bookings.get(ref);
        if (!rec)
            throw new Error("NOT_FOUND");
        rec.agreement_ref = agreement_ref; // Ensure agreement_ref is set
        return rec;
    }
}
import { prisma } from "../data/prisma.js";
import { makeGrpcSourceAdapter } from "./grpcSourceAdapter.js";
// Lazy import to avoid circular deps in TS build if any
async function loadGrpcAdapter() {
    const mod = await import("./grpc.adapter.js");
    return mod.GrpcAdapter;
}
export async function getAdapterForSource(sourceId) {
    const src = await prisma.company.findUnique({ where: { id: sourceId } });
    if (!src)
        throw new Error("SOURCE_NOT_FOUND");
    // Check for gRPC usage
    const useGrpc = src.use_grpc === true;
    // Or detect from api_base_url: grpc://host:port → extract address
    let grpcAddr = null;
    if (typeof src.api_base_url === "string" && src.api_base_url.startsWith("grpc://")) {
        grpcAddr = src.api_base_url.replace("grpc://", "");
    }
    if (useGrpc || grpcAddr) {
        const addr = grpcAddr || `${src.grpc_host || "localhost"}:${src.grpc_port || 50061}`;
        console.log(`🔌 Using gRPC adapter for source ${sourceId} at ${addr}`);
        return makeGrpcSourceAdapter(addr);
    }
    if (src.adapterType === "grpc" && src.grpcEndpoint) {
        const GrpcAdapter = await loadGrpcAdapter();
        return new GrpcAdapter({ endpoint: src.grpcEndpoint, authHeader: process.env.SUPPLIER_GRPC_AUTH || "", sourceId });
    }
    console.log(`🌐 Using HTTP adapter for source ${sourceId}`);
    return new MockAdapter();
}
