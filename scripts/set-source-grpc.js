import { prisma } from "../src/data/prisma.js";

const sourceId = process.argv[2];
const endpoint = process.argv[3]; // e.g. localhost:60061

if (!sourceId || !endpoint) {
  console.error("Usage: node scripts/set-source-grpc.js <SOURCE_ID> <endpoint>");
  process.exit(1);
}

const main = async () => {
  await prisma.company.update({
    where: { id: sourceId },
    data: { adapterType: "grpc", grpcEndpoint: endpoint }
  });
  console.log("Updated source -> grpc", { sourceId, endpoint });
};

main().finally(()=>process.exit(0));


