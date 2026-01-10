import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolveProtoPath } from "../util/resolveProtoPath.js";
export function makeAgentGrpcClient(address) {
    const { path: protoPath, tried } = resolveProtoPath("agent_tester.proto", process.env.AGENT_TESTER_PROTO_PATH);
    if (!protoPath) {
        const hint = [
            "Unable to locate agent_tester.proto.",
            "Set env AGENT_TESTER_PROTO_PATH to the full file path, or place the file in one of:",
            "- <repo-root>/protos/agent_tester.proto",
            "- <middleware-backend>/protos/agent_tester.proto",
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
    const { AgentTesterService } = grpc.loadPackageDefinition(def).carhire.agent.v1;
    return new AgentTesterService(address, grpc.credentials.createInsecure());
}
export const agtProm = (client, method, req = {}) => new Promise((res, rej) => client[method](req, (e, r) => e ? rej(e) : res(r)));
