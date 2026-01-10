import { loadProto, createGrpcClient } from '../helpers/loadProto.js';
import { logger } from '../../infra/logger.js';
const SOURCE_GRPC_ADDR = process.env.SOURCE_GRPC_ADDR || 'localhost:51061';
let sourceProviderService = null;
let healthService = null;
/**
 * Get the SourceProviderService client
 * @returns Connected gRPC client for SourceProviderService
 */
export function getSourceProviderClient() {
    if (!sourceProviderService) {
        try {
            const sourceProto = loadProto('protos/source_provider.proto', 'source_provider');
            const SourceProviderService = sourceProto.SourceProviderService;
            if (!SourceProviderService) {
                throw new Error('SourceProviderService not found in proto');
            }
            sourceProviderService = createGrpcClient(SourceProviderService, SOURCE_GRPC_ADDR);
            logger.info({ addr: SOURCE_GRPC_ADDR }, 'SourceProviderService client created');
        }
        catch (error) {
            logger.error({ error, addr: SOURCE_GRPC_ADDR }, 'Failed to create SourceProviderService client');
            throw error;
        }
    }
    return sourceProviderService;
}
/**
 * Get the Health service client for source
 * @returns Connected gRPC client for Health service
 */
export function getSourceHealthClient() {
    if (!healthService) {
        try {
            const healthProto = loadProto('protos/health.proto', 'grpc.health.v1');
            const Health = healthProto.Health;
            if (!Health) {
                throw new Error('Health service not found in proto');
            }
            healthService = createGrpcClient(Health, SOURCE_GRPC_ADDR);
            logger.info({ addr: SOURCE_GRPC_ADDR }, 'Source Health client created');
        }
        catch (error) {
            logger.error({ error, addr: SOURCE_GRPC_ADDR }, 'Failed to create Source Health client');
            throw error;
        }
    }
    return healthService;
}
/**
 * Check if source gRPC service is available
 * @returns Promise<boolean> - true if service is available
 */
export async function checkSourceHealth() {
    try {
        const healthClient = getSourceHealthClient();
        return new Promise((resolve) => {
            healthClient.Check({ service: '' }, (err, response) => {
                if (err) {
                    logger.warn({ error: err.message }, 'Source health check failed');
                    resolve(false);
                }
                else {
                    logger.info({ status: response.status }, 'Source health check passed');
                    resolve(true);
                }
            });
        });
    }
    catch (error) {
        logger.error({ error }, 'Source health check error');
        return false;
    }
}
