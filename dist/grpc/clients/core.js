import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
function load(protoPath) {
    const pkgDef = protoLoader.loadSync(protoPath, {
        keepCase: true, // 👈 keep snake_case from .proto
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });
    return grpc.loadPackageDefinition(pkgDef);
}
const CORE_ADDR = `localhost:${process.env.GRPC_CORE_PORT || 50051}`;
export function availabilityClient() {
    const pkg = load("src/grpc/proto/availability.proto");
    const Client = pkg.core.availability.AvailabilityService;
    return new Client(CORE_ADDR, grpc.credentials.createInsecure());
}
export function bookingClient() {
    const pkg = load("src/grpc/proto/booking.proto");
    const Client = pkg.core.booking.BookingService;
    return new Client(CORE_ADDR, grpc.credentials.createInsecure());
}
