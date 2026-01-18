import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../infra/auth.js";
import { requireRole } from "../../infra/policies.js";
import { createHealthClient, createSourceClient, createAgentClient, } from "../../infra/grpcClients.js";
import { config } from "../../infra/config.js";
import { prisma } from "../../data/prisma.js";
import path from "path";
/* global __dirname */
export const adminGrpcRouter = Router();
// Helper function to format gRPC errors into user-friendly messages
function formatGrpcError(error, address) {
    const errorStr = String(error);
    const errorMessage = error?.message || errorStr;
    // Check for common gRPC error codes
    if (errorStr.includes('14 UNAVAILABLE') || errorStr.includes('UNAVAILABLE')) {
        return `Cannot connect to gRPC server at ${address}. The server may not be running or the address is incorrect. Please verify the gRPC server is running and the address is correct.`;
    }
    if (errorStr.includes('4 DEADLINE_EXCEEDED') || errorStr.includes('DEADLINE_EXCEEDED')) {
        return `Connection timeout while trying to reach ${address}. The server may be slow or unreachable.`;
    }
    if (errorStr.includes('12 UNIMPLEMENTED') || errorStr.includes('UNIMPLEMENTED')) {
        return `The gRPC service at ${address} does not implement the requested method.`;
    }
    if (errorStr.includes('2 UNKNOWN') || errorStr.includes('UNKNOWN')) {
        return `Unknown error occurred while connecting to ${address}: ${errorMessage}`;
    }
    // Return formatted error message
    return `gRPC connection error: ${errorMessage}`;
}
// Helper function to validate gRPC address format
function validateGrpcAddress(address) {
    if (!address || typeof address !== 'string') {
        return { valid: false, error: 'Address is required and must be a string' };
    }
    // Remove grpc:// prefix if present
    const cleanAddr = address.replace(/^grpc:\/\//, '');
    // Check for host:port format
    const parts = cleanAddr.split(':');
    if (parts.length !== 2) {
        return { valid: false, error: 'Address must be in format host:port (e.g., localhost:9091)' };
    }
    const port = parseInt(parts[1], 10);
    if (isNaN(port) || port < 1 || port > 65535) {
        return { valid: false, error: 'Port must be a number between 1 and 65535' };
    }
    return { valid: true };
}
// Configuration schema
const grpcConfigSchema = z.object({
    sourceGrpcAddr: z.string().optional(),
    agentGrpcAddr: z.string().optional(),
});
const agentTokenSchema = z.object({
    token: z.string().optional(),
});
/**
 * @openapi
 * /ui/config:
 *   get:
 *     tags: [Admin UI]
 *     summary: Get UI configuration and feature flags
 *     description: Returns configuration for the admin UI including feature flags and default addresses
 *     responses:
 *       200:
 *         description: UI configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 features:
 *                   type: object
 *                   properties:
 *                     whitelist:
 *                       type: boolean
 *                     metrics:
 *                       type: boolean
 *                     verification:
 *                       type: boolean
 *                     grpcTesting:
 *                       type: boolean
 *                 defaults:
 *                   type: object
 *                   properties:
 *                     sourceHttpUrl:
 *                       type: string
 *                     agentHttpUrl:
 *                       type: string
 *                     sourceGrpcAddr:
 *                       type: string
 *                     agentGrpcAddr:
 *                       type: string
 *                 protos:
 *                   type: object
 *                   properties:
 *                     source_provider:
 *                       type: string
 *                     agent_tester:
 *                       type: string
 */
adminGrpcRouter.get("/ui/config", (_req, res) => {
    res.json({
        features: config.features,
        defaults: {
            sourceHttpUrl: `http://localhost:${config.sourceHttpPort}`,
            agentHttpUrl: `http://localhost:${config.agentHttpPort}`,
            sourceGrpcAddr: config.sourceGrpcAddr,
            agentGrpcAddr: config.agentGrpcAddr,
        },
        protos: {
            source_provider: path.resolve(process.cwd(), "protos/source_provider.proto"),
            agent_tester: path.resolve(process.cwd(), "protos/agent_tester.proto"),
        },
    });
});
/**
 * @openapi
 * /admin/grpc/config:
 *   get:
 *     tags: [Admin gRPC]
 *     summary: Get current gRPC configuration
 *     description: Returns current gRPC addresses for source and agent services
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current gRPC configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sourceGrpcAddr:
 *                   type: string
 *                 agentGrpcAddr:
 *                   type: string
 */
adminGrpcRouter.get("/admin/grpc/config", requireAuth(), requireRole("ADMIN"), (_req, res) => {
    res.json({
        sourceGrpcAddr: process.env.SOURCE_GRPC_ADDR || config.sourceGrpcAddr,
        agentGrpcAddr: process.env.AGENT_GRPC_ADDR || config.agentGrpcAddr,
    });
});
/**
 * @openapi
 * /admin/grpc/config:
 *   post:
 *     tags: [Admin gRPC]
 *     summary: Update gRPC configuration
 *     description: Updates gRPC addresses for source and agent services (in-memory for session)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sourceGrpcAddr:
 *                 type: string
 *               agentGrpcAddr:
 *                 type: string
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 sourceGrpcAddr:
 *                   type: string
 *                 agentGrpcAddr:
 *                   type: string
 */
adminGrpcRouter.post("/admin/grpc/config", requireAuth(), requireRole("ADMIN"), (req, res) => {
    try {
        const body = grpcConfigSchema.parse(req.body || {});
        if (body.sourceGrpcAddr) {
            process.env.SOURCE_GRPC_ADDR = body.sourceGrpcAddr;
        }
        if (body.agentGrpcAddr) {
            process.env.AGENT_GRPC_ADDR = body.agentGrpcAddr;
        }
        res.json({
            ok: true,
            sourceGrpcAddr: process.env.SOURCE_GRPC_ADDR || config.sourceGrpcAddr,
            agentGrpcAddr: process.env.AGENT_GRPC_ADDR || config.agentGrpcAddr,
        });
    }
    catch (error) {
        res.status(400).json({
            error: "INVALID_CONFIG",
            message: error?.message || String(error),
        });
    }
});
/**
 * @openapi
 * /admin/agent/register:
 *   post:
 *     tags: [Admin Agent]
 *     summary: Register agent token
 *     description: Stores agent token in-memory for session (can be persisted to .env if needed)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agent token registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 has_token:
 *                   type: boolean
 */
// Agent token management endpoints
adminGrpcRouter.get("/admin/agent-token", requireAuth(), requireRole("ADMIN"), (_req, res) => {
    const token = process.env.AGENT_TOKEN || "";
    res.json({
        token: token ? `${token.substring(0, 8)}...` : "",
        expires_at: undefined,
    });
});
adminGrpcRouter.post("/admin/agent-token", requireAuth(), requireRole("ADMIN"), (req, res) => {
    try {
        const body = agentTokenSchema.parse(req.body || {});
        const token = body.token || "";
        process.env.AGENT_TOKEN = token;
        res.json({
            ok: true,
            has_token: !!token,
        });
    }
    catch (error) {
        res.status(400).json({
            error: "INVALID_TOKEN",
            message: error?.message || String(error),
        });
    }
});
adminGrpcRouter.delete("/admin/agent-token", requireAuth(), requireRole("ADMIN"), (_req, res) => {
    process.env.AGENT_TOKEN = "";
    res.json({ ok: true });
});
/**
 * @openapi
 * /admin/test/source-grpc:
 *   post:
 *     tags: [Admin Testing]
 *     summary: Test source gRPC connectivity
 *     description: Tests connectivity to source gRPC service using health check
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               addr:
 *                 type: string
 *                 description: gRPC address to test
 *     responses:
 *       200:
 *         description: Source gRPC test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 addr:
 *                   type: string
 *                 ms:
 *                   type: number
 *                 result:
 *                   type: object
 *       500:
 *         description: Source gRPC test failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 addr:
 *                   type: string
 *                 error:
 *                   type: string
 */
adminGrpcRouter.post("/admin/test/source-grpc", requireAuth(), requireRole("ADMIN"), async (req, res) => {
    const addr = req.body?.addr || process.env.SOURCE_GRPC_ADDR || config.sourceGrpcAddr;
    // Validate address format
    if (!addr) {
        return res.status(400).json({
            ok: false,
            error: 'No gRPC address provided. Please provide an address in the request body or configure SOURCE_GRPC_ADDR environment variable.',
            message: 'Address is required'
        });
    }
    const validation = validateGrpcAddress(addr);
    if (!validation.valid) {
        return res.status(400).json({
            ok: false,
            addr,
            error: validation.error,
            message: 'Invalid address format'
        });
    }
    const t0 = Date.now();
    try {
        const healthClient = createHealthClient(addr);
        const result = await healthClient.check();
        res.json({
            ok: true,
            addr,
            ms: Date.now() - t0,
            result,
        });
    }
    catch (error) {
        const errorMessage = formatGrpcError(error, addr);
        res.status(500).json({
            ok: false,
            addr,
            error: errorMessage,
            details: error?.message || String(error),
            code: error?.code || 'UNKNOWN'
        });
    }
});
// Schema for source gRPC test request
const sourceGrpcTestSchema = z.object({
    addr: z.string().optional(),
    grpcEndpoints: z.object({
        health: z.string().optional(),
        locations: z.string().optional(),
        availability: z.string().optional(),
        bookings: z.string().optional()
    }).optional()
});
/**
 * @openapi
 * /admin/test/source-grpc:
 *   post:
 *     tags: [Admin Testing]
 *     summary: Test source gRPC connectivity and endpoints
 *     description: Tests connectivity to source gRPC service and validates specific endpoints
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               addr:
 *                 type: string
 *                 description: gRPC address to test (defaults to SOURCE_GRPC_ADDR)
 *               grpcEndpoints:
 *                 type: object
 *                 description: Specific gRPC endpoints to test
 *                 properties:
 *                   health:
 *                     type: string
 *                     description: Test health endpoint (always tested by default)
 *                   locations:
 *                     type: string
 *                     description: Test locations endpoint
 *                   availability:
 *                     type: string
 *                     description: Test availability endpoint
 *                   bookings:
 *                     type: string
 *                     description: Test bookings endpoint
 *     responses:
 *       200:
 *         description: Source gRPC test results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   description: Overall test success
 *                 addr:
 *                   type: string
 *                   description: Tested gRPC address
 *                 totalMs:
 *                   type: number
 *                   description: Total test duration in milliseconds
 *                 endpoints:
 *                   type: object
 *                   description: Results for each tested endpoint
 *                   properties:
 *                     health:
 *                       type: object
 *                       properties:
 *                         ok:
 *                           type: boolean
 *                         result:
 *                           type: object
 *                         ms:
 *                           type: number
 *                         error:
 *                           type: string
 *                     locations:
 *                       type: object
 *                       properties:
 *                         ok:
 *                           type: boolean
 *                         result:
 *                           type: object
 *                         ms:
 *                           type: number
 *                         error:
 *                           type: string
 *                     availability:
 *                       type: object
 *                       properties:
 *                         ok:
 *                           type: boolean
 *                         result:
 *                           type: object
 *                         ms:
 *                           type: number
 *                         error:
 *                           type: string
 *                     bookings:
 *                       type: object
 *                       properties:
 *                         ok:
 *                           type: boolean
 *                         result:
 *                           type: object
 *                         ms:
 *                           type: number
 *                         error:
 *                           type: string
 *                 tested:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of endpoints that were tested
 *       500:
 *         description: Test failed or invalid request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 error:
 *                   type: string
 *                 message:
 *                   type: string
 */
adminGrpcRouter.post("/test/source-grpc", requireAuth(), async (req, res) => {
    try {
        const body = sourceGrpcTestSchema.parse(req.body);
        const addr = body.addr || process.env.SOURCE_GRPC_ADDR || config.sourceGrpcAddr;
        // Validate address format
        if (!addr) {
            return res.status(400).json({
                ok: false,
                error: 'No gRPC address provided. Please provide an address in the request body or configure SOURCE_GRPC_ADDR environment variable.',
                message: 'Address is required'
            });
        }
        const validation = validateGrpcAddress(addr);
        if (!validation.valid) {
            return res.status(400).json({
                ok: false,
                addr,
                error: validation.error,
                message: 'Invalid address format'
            });
        }
        const grpcEndpoints = body.grpcEndpoints || {};
        const t0 = Date.now();
        const results = {
            health: null,
            locations: null,
            availability: null,
            bookings: null
        };
        // Test health endpoint
        try {
            const healthClient = createHealthClient(addr);
            const healthResult = await healthClient.check();
            results.health = {
                ok: true,
                result: healthResult,
                ms: Date.now() - t0
            };
        }
        catch (error) {
            results.health = {
                ok: false,
                error: formatGrpcError(error, addr),
                ms: Date.now() - t0
            };
        }
        // Test locations endpoint if provided
        if (grpcEndpoints.locations) {
            try {
                const sourceClient = createSourceClient(addr);
                const locationsResult = await sourceClient.getLocations();
                results.locations = {
                    ok: true,
                    result: locationsResult,
                    ms: Date.now() - t0
                };
            }
            catch (error) {
                results.locations = {
                    ok: false,
                    error: formatGrpcError(error, addr),
                    ms: Date.now() - t0
                };
            }
        }
        // Test availability endpoint if provided
        if (grpcEndpoints.availability) {
            try {
                const sourceClient = createSourceClient(addr);
                const availabilityResult = await sourceClient.getAvailability({
                    agreement_ref: "TEST-001",
                    pickup_unlocode: "GBMAN",
                    dropoff_unlocode: "GBGLA",
                    pickup_iso: "2025-10-08T10:00:00Z",
                    dropoff_iso: "2025-10-10T10:00:00Z",
                    driver_age: 30,
                    residency_country: "GB",
                    vehicle_classes: ["ECMN"]
                });
                results.availability = {
                    ok: true,
                    result: availabilityResult,
                    ms: Date.now() - t0
                };
            }
            catch (error) {
                results.availability = {
                    ok: false,
                    error: formatGrpcError(error, addr),
                    ms: Date.now() - t0
                };
            }
        }
        // Test bookings endpoint if provided
        if (grpcEndpoints.bookings) {
            try {
                const sourceClient = createSourceClient(addr);
                const bookingResult = await sourceClient.createBooking({
                    agreement_ref: "TEST-001",
                    supplier_offer_ref: "OFFER-123",
                    agent_booking_ref: "AGENT-456",
                    idempotency_key: "test-key-123"
                });
                results.bookings = {
                    ok: true,
                    result: bookingResult,
                    ms: Date.now() - t0
                };
            }
            catch (error) {
                results.bookings = {
                    ok: false,
                    error: formatGrpcError(error, addr),
                    ms: Date.now() - t0
                };
            }
        }
        // Determine overall status
        const overallOk = Object.values(results).every(result => result === null || (result && result.ok === true));
        const totalMs = Date.now() - t0;
        const testResult = {
            ok: overallOk,
            addr,
            totalMs,
            endpoints: results,
            tested: Object.keys(grpcEndpoints).filter(key => grpcEndpoints[key])
        };
        // Save test result to database if user is authenticated and is a source
        const user = req.user;
        if (user?.companyId && user?.companyType === 'SOURCE') {
            try {
                await prisma.company.update({
                    where: { id: user.companyId },
                    data: {
                        lastGrpcTestResult: testResult,
                        lastGrpcTestAt: new Date(),
                    },
                });
            }
            catch (error) {
                console.error('Failed to save gRPC test result to database:', error);
                // Don't fail the request if saving fails
            }
        }
        res.json(testResult);
    }
    catch (error) {
        res.status(500).json({
            ok: false,
            error: String(error?.message || error),
            message: "Invalid request body or gRPC test failed"
        });
    }
});
/**
 * @openapi
 * /admin/test/agent-grpc:
 *   post:
 *     tags: [Admin Testing]
 *     summary: Test agent gRPC connectivity
 *     description: Tests connectivity to agent gRPC service using health check
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               addr:
 *                 type: string
 *                 description: gRPC address to test
 *     responses:
 *       200:
 *         description: Agent gRPC test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 addr:
 *                   type: string
 *                 ms:
 *                   type: number
 *                 result:
 *                   type: object
 *       500:
 *         description: Agent gRPC test failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 addr:
 *                   type: string
 *                 error:
 *                   type: string
 */
adminGrpcRouter.post("/admin/test/agent-grpc", requireAuth(), requireRole("ADMIN"), async (req, res) => {
    const addr = req.body?.addr || process.env.AGENT_GRPC_ADDR || config.agentGrpcAddr;
    // Validate address format
    if (!addr) {
        return res.status(400).json({
            ok: false,
            error: 'No gRPC address provided. Please provide an address in the request body or configure AGENT_GRPC_ADDR environment variable.',
            message: 'Address is required'
        });
    }
    const validation = validateGrpcAddress(addr);
    if (!validation.valid) {
        return res.status(400).json({
            ok: false,
            addr,
            error: validation.error,
            message: 'Invalid address format'
        });
    }
    const t0 = Date.now();
    try {
        const healthClient = createHealthClient(addr);
        const result = await healthClient.check();
        res.json({
            ok: true,
            addr,
            ms: Date.now() - t0,
            result,
        });
    }
    catch (error) {
        const errorMessage = formatGrpcError(error, addr);
        res.status(500).json({
            ok: false,
            addr,
            error: errorMessage,
            details: error?.message || String(error),
            code: error?.code || 'UNKNOWN'
        });
    }
});
/**
 * @openapi
 * /admin/test/agent-ping:
 *   get:
 *     tags: [Admin Testing]
 *     summary: Test agent gRPC ping
 *     description: Tests agent gRPC service by calling the Ping method
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent ping test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 addr:
 *                   type: string
 *                 ms:
 *                   type: number
 *                 out:
 *                   type: object
 *       500:
 *         description: Agent ping test failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 addr:
 *                   type: string
 *                 error:
 *                   type: string
 */
adminGrpcRouter.get("/admin/test/agent-ping", requireAuth(), requireRole("ADMIN"), async (_req, res) => {
    const addr = process.env.AGENT_GRPC_ADDR || config.agentGrpcAddr;
    const t0 = Date.now();
    try {
        const agentClient = createAgentClient(addr);
        const result = await agentClient.getHealth();
        res.json({
            ok: true,
            addr,
            ms: Date.now() - t0,
            out: result,
        });
    }
    catch (error) {
        res.status(500).json({
            ok: false,
            addr,
            error: String(error),
        });
    }
});
/**
 * @openapi
 * /admin/test/source-ping:
 *   get:
 *     tags: [Admin Testing]
 *     summary: Test source gRPC ping
 *     description: Tests source gRPC service by calling the GetHealth method
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Source ping test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 addr:
 *                   type: string
 *                 ms:
 *                   type: number
 *                 out:
 *                   type: object
 *       500:
 *         description: Source ping test failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 addr:
 *                   type: string
 *                 error:
 *                   type: string
 */
adminGrpcRouter.get("/admin/test/source-ping", requireAuth(), requireRole("ADMIN"), async (_req, res) => {
    const addr = process.env.SOURCE_GRPC_ADDR || config.sourceGrpcAddr;
    const t0 = Date.now();
    try {
        const sourceClient = createSourceClient(addr);
        const result = await sourceClient.getHealth();
        res.json({
            ok: true,
            addr,
            ms: Date.now() - t0,
            out: result,
        });
    }
    catch (error) {
        res.status(500).json({
            ok: false,
            addr,
            error: String(error),
        });
    }
});
