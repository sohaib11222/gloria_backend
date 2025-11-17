import { loadProto, createGrpcClient } from '../helpers/loadProto.js';
import { logger } from '../../infra/logger.js';

const AGENT_GRPC_ADDR = process.env.AGENT_GRPC_ADDR || 'localhost:51062';

let agentTesterService: any = null;
let healthService: any = null;

/**
 * Get the AgentTesterService client
 * @returns Connected gRPC client for AgentTesterService
 */
export function getAgentTesterClient() {
  if (!agentTesterService) {
    try {
      const agentProto = loadProto('protos/agent_tester.proto', 'carhire.agent.v1');
      const AgentTesterService = agentProto.AgentTesterService;
      
      if (!AgentTesterService) {
        throw new Error('AgentTesterService not found in proto');
      }
      
      agentTesterService = createGrpcClient(AgentTesterService, AGENT_GRPC_ADDR);
      logger.info({ addr: AGENT_GRPC_ADDR }, 'AgentTesterService client created');
    } catch (error) {
      logger.error({ error, addr: AGENT_GRPC_ADDR }, 'Failed to create AgentTesterService client');
      throw error;
    }
  }
  
  return agentTesterService;
}

/**
 * Get the Health service client for agent
 * @returns Connected gRPC client for Health service
 */
export function getAgentHealthClient() {
  if (!healthService) {
    try {
      const healthProto = loadProto('protos/health.proto', 'grpc.health.v1');
      const Health = healthProto.Health;
      
      if (!Health) {
        throw new Error('Health service not found in proto');
      }
      
      healthService = createGrpcClient(Health, AGENT_GRPC_ADDR);
      logger.info({ addr: AGENT_GRPC_ADDR }, 'Agent Health client created');
    } catch (error) {
      logger.error({ error, addr: AGENT_GRPC_ADDR }, 'Failed to create Agent Health client');
      throw error;
    }
  }
  
  return healthService;
}

/**
 * Check if agent gRPC service is available
 * @returns Promise<boolean> - true if service is available
 */
export async function checkAgentHealth(): Promise<boolean> {
  try {
    const healthClient = getAgentHealthClient();
    
    return new Promise((resolve) => {
      healthClient.Check({ service: '' }, (err: any, response: any) => {
        if (err) {
          logger.warn({ error: err.message }, 'Agent health check failed');
          resolve(false);
        } else {
          logger.info({ status: response.status }, 'Agent health check passed');
          resolve(true);
        }
      });
    });
  } catch (error) {
    logger.error({ error }, 'Agent health check error');
    return false;
  }
}
