import dotenv from 'dotenv';
// Load environment variables
dotenv.config();
function getEnvVar(key, defaultValue = '') {
    return process.env[key] || defaultValue;
}
function getEnvNumber(key, defaultValue) {
    const value = process.env[key];
    return value ? parseInt(value, 10) : defaultValue;
}
function getEnvBoolean(key, defaultValue) {
    const value = process.env[key];
    return value ? value.toLowerCase() === 'true' || value === '1' : defaultValue;
}
export const config = {
    // HTTP ports
    middlewareHttpPort: getEnvNumber('MIDDLEWARE_HTTP_PORT', 8080),
    sourceHttpPort: getEnvNumber('SOURCE_HTTP_PORT', 9090),
    agentHttpPort: getEnvNumber('AGENT_HTTP_PORT', 9091),
    // gRPC server bind addresses (prefer high ports to avoid Windows excluded ranges)
    sourceGrpcHost: getEnvVar('SOURCE_GRPC_HOST', '0.0.0.0'),
    sourceGrpcPort: getEnvNumber('SOURCE_GRPC_PORT', 51061),
    agentGrpcHost: getEnvVar('AGENT_GRPC_HOST', '0.0.0.0'),
    agentGrpcPort: getEnvNumber('AGENT_GRPC_PORT', 51062),
    // gRPC client targets
    sourceGrpcAddr: getEnvVar('SOURCE_GRPC_ADDR', 'localhost:51061'),
    agentGrpcAddr: getEnvVar('AGENT_GRPC_ADDR', 'localhost:51062'),
    // Agent token management
    agentToken: getEnvVar('AGENT_TOKEN', ''),
    middlewareAllowAdmin: getEnvBoolean('MIDDLEWARE_ALLOW_ADMIN', true),
    // Feature flags
    features: {
        whitelist: getEnvBoolean('FEATURE_WHITELIST', true),
        metrics: getEnvBoolean('FEATURE_METRICS', true),
        verification: getEnvBoolean('FEATURE_VERIFICATION', true),
        grpcTesting: getEnvBoolean('FEATURE_GRPC_TESTING', true),
    },
    // Database
    databaseUrl: getEnvVar('DATABASE_URL', 'mysql://root:@localhost:3306/car_hire_mw'),
    // JWT
    jwtSecret: getEnvVar('JWT_SECRET', 'supersecret-change-me'),
    jwtExpires: getEnvVar('JWT_EXPIRES', '15m'),
    jwtRefreshExpires: getEnvVar('JWT_REFRESH_EXPIRES', '7d'),
    // Rate limiting
    rateLimitWindowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000),
    rateLimitMax: getEnvNumber('RATE_LIMIT_MAX', 120),
    // Email
    emailFrom: getEnvVar('EMAIL_FROM', 'no-reply@carhire.local'),
    // Health monitoring
    enableHealthMonitor: getEnvBoolean('ENABLE_HEALTH_MONITOR', true),
};
export function getServiceConfig(serviceName) {
    switch (serviceName) {
        case 'middleware':
            return {
                middlewareHttpPort: config.middlewareHttpPort,
                sourceGrpcAddr: config.sourceGrpcAddr,
                agentGrpcAddr: config.agentGrpcAddr,
                agentToken: config.agentToken,
                middlewareAllowAdmin: config.middlewareAllowAdmin,
                features: config.features,
                databaseUrl: config.databaseUrl,
                jwtSecret: config.jwtSecret,
                jwtExpires: config.jwtExpires,
                jwtRefreshExpires: config.jwtRefreshExpires,
                rateLimitWindowMs: config.rateLimitWindowMs,
                rateLimitMax: config.rateLimitMax,
                emailFrom: config.emailFrom,
                enableHealthMonitor: config.enableHealthMonitor,
            };
        case 'source':
            return {
                sourceHttpPort: config.sourceHttpPort,
                sourceGrpcHost: config.sourceGrpcHost,
                sourceGrpcPort: config.sourceGrpcPort,
                databaseUrl: config.databaseUrl,
            };
        case 'agent':
            return {
                agentHttpPort: config.agentHttpPort,
                agentGrpcHost: config.agentGrpcHost,
                agentGrpcPort: config.agentGrpcPort,
                agentToken: config.agentToken,
            };
        default:
            return {};
    }
}
