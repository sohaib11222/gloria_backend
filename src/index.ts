import "dotenv/config";
import { buildApp } from "./api/app.js";
import { logger } from "./infra/logger.js";
import { startGrpcServers } from "./grpc/server.js";
import { startPublicGrpcServer } from "./grpc/publicServer.js";
import { createHealthClient } from "./infra/grpcClients.js";
import { config } from "./infra/config.js";
import { startLocationSync } from "./jobs/locationSync.js";

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "UnhandledPromiseRejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "UncaughtException");
});

const PORT = Number(process.env.PORT || 8080);

async function main() {
  // Start gRPC servers
  await startGrpcServers();
  await startPublicGrpcServer();
  
  // Test gRPC client connectivity
  try {
    const sourceHealth = createHealthClient(config.sourceGrpcAddr);
    await sourceHealth.check();
    logger.info({ addr: config.sourceGrpcAddr }, "Source gRPC client connected");
  } catch (error) {
    logger.warn({ addr: config.sourceGrpcAddr, error: error.message }, "Source gRPC client failed");
  }
  
  try {
    const agentHealth = createHealthClient(config.agentGrpcAddr);
    await agentHealth.check();
    logger.info({ addr: config.agentGrpcAddr }, "Agent gRPC client connected");
  } catch (error) {
    logger.warn({ addr: config.agentGrpcAddr, error: error.message }, "Agent gRPC client failed");
  }
  
  const app = buildApp();
  app.listen(PORT, () => {
    logger.info({ 
      port: PORT,
      sourceGrpcAddr: config.sourceGrpcAddr,
      agentGrpcAddr: config.agentGrpcAddr,
      features: config.features
    }, "HTTP server listening");
    
    // Start location sync job
    startLocationSync();
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});




