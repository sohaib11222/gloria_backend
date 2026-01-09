import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
const CORE_ADDR = `localhost:${process.env.GRPC_CORE_PORT || 50051}`;
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
export function locationClient() {
    const pkg = load("src/grpc/proto/location.proto");
    const Client = pkg.core.location.LocationService;
    return new Client(CORE_ADDR, grpc.credentials.createInsecure());
}
