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
export function verificationClient() {
    const pkg = load("src/grpc/proto/verification.proto");
    const Client = pkg.core.verification.VerificationService;
    return new Client(CORE_ADDR, grpc.credentials.createInsecure());
}
