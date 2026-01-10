import { Router } from "express";
import { resolveProtoPath } from "../../grpc/util/resolveProtoPath.js";

const router = Router();

router.get("/config", (req, res) => {
  const src = resolveProtoPath("source_provider.proto", process.env.SOURCE_PROVIDER_PROTO_PATH);
  const agt = resolveProtoPath("agent_tester.proto", process.env.AGENT_TESTER_PROTO_PATH);

  res.json({
    features: {
      whitelist: true,
      metrics: true,
      verification: true,
      grpcTesting: true
    },
    defaults: {
      sourceHttpUrl: "http://localhost:9090",
      agentHttpUrl: "http://localhost:9091",
      sourceGrpcAddr: "localhost:50061",
      agentGrpcAddr: "localhost:50062"
    },
    protos: {
      source_provider: src.path || null,
      agent_tester: agt.path || null,
      tried_source: src.tried,
      tried_agent: agt.tried
    }
  });
});

export default router;
