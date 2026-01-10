import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

/* global process */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_DIR = path.resolve(__dirname, '../../..', 'protos');

function loadProto(filename, pkg = null) {
  const protoPath = path.join(PROTO_DIR, filename);
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_DIR],
  });
  const proto = grpc.loadPackageDefinition(packageDefinition);
  return pkg ? proto[pkg] : proto;
}

const SourceProto = loadProto('source_provider.proto');  // expects SourceProviderService
const HealthProto = loadProto('health.proto');

// Optional: Agent tester (if present)
let AgentTesterProto = null;
try {
  AgentTesterProto = loadProto('agent_tester.proto'); // service name may vary
} catch {
  AgentTesterProto = null;
}

export function getSourceClient(addr) {
  // service name must align with your proto (printed in your logs as SourceProviderService)
  const Service = SourceProto.carhire?.source?.v1?.SourceProviderService;
  if (!Service) throw new Error('SourceProviderService not found in source_provider.proto');
  return new Service(addr, grpc.credentials.createInsecure());
}

export function getHealthClient(addr) {
  const Health = HealthProto.grpc?.health?.v1?.Health;
  if (!Health) throw new Error('Health service not found in health.proto');
  return new Health(addr, grpc.credentials.createInsecure());
}

export function getAgentTesterClient(addr) {
  if (!AgentTesterProto) return null;
  // Try common names gracefully
  const svc =
    AgentTesterProto.carhire?.agent?.v1?.AgentTesterService ||
    AgentTesterProto.AgentTesterService ||
    AgentTesterProto.AgentTester ||
    AgentTesterProto.TesterService ||
    null;
  return svc ? new svc(addr, grpc.credentials.createInsecure()) : null;
}

// Small helper to wrap unary calls as promises with deadline
export function unary(client, methodName, request = {}, timeoutMs = 4000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const deadline = new Date(Date.now() + timeoutMs);
    client[methodName](request, { deadline }, (err, resp) => {
      if (err) return reject(err);
      resolve({ ms: Date.now() - started, resp });
    });
  });
}
