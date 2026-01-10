/**
 * TEST PLAN (must be included as comments at top of admin/grpc.routes file)
 * 1) Create at least one SOURCE company (via existing admin create or SQL).
 * 2) Set SOURCE_GRPC_ADDR and AGENT_GRPC_ADDR in .env to the running services (0.0.0.0:51061 and 0.0.0.0:51062).
 * 3) Seed UN/LOCODE (npm run seed:unlocode).
 * 4) POST /admin/grpc/source/locations { sourceId } -> expect { ok: true, count > 0 } and rows in sourceLocation.
 * 5) GET  /coverage/source/:sourceId -> expect items list from cache.
 * 6) (Optional) POST /coverage/source/:sourceId/sync as the Source user -> should also work.
 * 7) Agreement overrides:
 *    - POST /coverage/agreement/:agreementId/override { unlocode, allowed: true }
 *    - GET  /coverage/agreement/:agreementId -> should include that unlocode
 *    - DELETE /coverage/agreement/:agreementId/override/:unlocode -> remove
 * 8) Availability:
 *    - POST /admin/grpc/source/availability with OTA-style body -> expect a valid AvailabilityResponse.
 * 9) Agent tests:
 *    - POST /admin/grpc/agent/ping -> SERVING
 *    - POST /admin/grpc/agent/run-check -> returns test run result.
 *
 * Edge cases to handle:
 * - Invalid/unseeded UN/LOCODEs returned by Source -> collect into `invalid: []` array and do not insert.
 * - Missing SOURCE_GRPC_ADDR / AGENT_GRPC_ADDR -> return 500 with clear message.
 * - Permissions: only ADMIN can hit /admin/grpc/* and /admin/sources.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../infra/auth.js';
import { requireCompanyType } from '../../infra/policies.js';
import { prisma } from '../../data/prisma.js';
import { getSourceProviderClient, checkSourceHealth } from '../../grpc/clients/source-grpc.client.js';
import { getAgentTesterClient, getAgentHealthClient, checkAgentHealth } from '../../grpc/clients/agent-grpc.client.js';
import { logger } from '../../infra/logger.js';
import { promisify } from 'util';
export const adminGrpcRouter = Router();
// Validation schemas
const sourceLocationsSchema = z.object({
    sourceId: z.string().min(1, 'Source ID is required'),
    agreementRef: z.string().optional()
});
const availabilitySchema = z.object({
    VehAvailRQCore: z.object({
        VehRentalCore: z.object({
            PickUpLocation: z.object({
                LocationCode: z.string()
            }),
            ReturnLocation: z.object({
                LocationCode: z.string()
            }),
            PickUpDateTime: z.string(),
            ReturnDateTime: z.string()
        })
    }),
    AgreementRef: z.string().optional()
});
const agentPingSchema = z.object({
    agentId: z.string().optional()
});
const agentRunCheckSchema = z.object({
    search: z.object({
        pickup_unlocode: z.string(),
        dropoff_unlocode: z.string(),
        pickup_iso: z.string(),
        dropoff_iso: z.string(),
        agreement_ref: z.string()
    })
});
/**
 * @openapi
 * /admin/grpc/source/locations:
 *   post:
 *     tags: [Admin, gRPC]
 *     summary: Trigger source location sync via gRPC
 *     description: Calls SourceProviderService.GetLocations and syncs to database
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sourceId:
 *                 type: string
 *                 description: Source company ID
 *               agreementRef:
 *                 type: string
 *                 description: Optional agreement reference
 *             required:
 *               - sourceId
 *     responses:
 *       200:
 *         description: Location sync completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 invalid:
 *                   type: array
 *                   items:
 *                     type: string
 *       422:
 *         description: Validation error
 *       500:
 *         description: gRPC service error
 */
adminGrpcRouter.post('/source/locations', requireAuth(), requireCompanyType('ADMIN'), async (req, res, next) => {
    try {
        const body = sourceLocationsSchema.parse(req.body);
        const { sourceId, agreementRef } = body;
        // Check if source exists
        const source = await prisma.company.findUnique({
            where: { id: sourceId },
            select: { id: true, companyName: true, type: true, status: true }
        });
        if (!source) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Source not found' });
        }
        if (source.type !== 'SOURCE') {
            return res.status(400).json({ error: 'BAD_REQUEST', message: 'Company is not a source' });
        }
        // Check gRPC service availability
        const isHealthy = await checkSourceHealth();
        if (!isHealthy) {
            return res.status(500).json({
                error: 'SERVICE_UNAVAILABLE',
                message: 'Source gRPC service is not available'
            });
        }
        // Call SourceProviderService.GetLocations
        const sourceClient = getSourceProviderClient();
        const getLocations = promisify(sourceClient.GetLocations.bind(sourceClient));
        const response = await getLocations({});
        const locations = response.locations || [];
        logger.info({ sourceId, count: locations.length }, 'Retrieved locations from source');
        // Validate each location against UN/LOCODE database
        const validLocations = [];
        const invalidLocations = [];
        for (const location of locations) {
            const unlocode = location.LocationCode || location.unlocode;
            if (!unlocode)
                continue;
            const exists = await prisma.uNLocode.findUnique({
                where: { unlocode }
            });
            if (exists) {
                validLocations.push({
                    unlocode,
                    name: location.LocationName || location.name || unlocode
                });
            }
            else {
                invalidLocations.push(unlocode);
            }
        }
        // Upsert valid locations into sourceLocation table
        let count = 0;
        for (const location of validLocations) {
            await prisma.sourceLocation.upsert({
                where: {
                    sourceId_unlocode: {
                        sourceId,
                        unlocode: location.unlocode
                    }
                },
                update: {
                // Update name if changed
                },
                create: {
                    sourceId,
                    unlocode: location.unlocode
                }
            });
            count++;
        }
        logger.info({ sourceId, count, invalid: invalidLocations.length }, 'Location sync completed');
        res.json({
            ok: true,
            count,
            invalid: invalidLocations
        });
    }
    catch (error) {
        logger.error({ error }, 'Source locations sync failed');
        next(error);
    }
});
/**
 * @openapi
 * /admin/grpc/source/availability:
 *   post:
 *     tags: [Admin, gRPC]
 *     summary: Test source availability via gRPC
 *     description: Calls SourceProviderService.GetAvailability with OTA-style request
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               VehAvailRQCore:
 *                 type: object
 *                 properties:
 *                   VehRentalCore:
 *                     type: object
 *                     properties:
 *                       PickUpLocation:
 *                         type: object
 *                         properties:
 *                           LocationCode:
 *                             type: string
 *                       ReturnLocation:
 *                         type: object
 *                         properties:
 *                           LocationCode:
 *                             type: string
 *                       PickUpDateTime:
 *                         type: string
 *                         format: date-time
 *                       ReturnDateTime:
 *                         type: string
 *                         format: date-time
 *               AgreementRef:
 *                 type: string
 *             required:
 *               - VehAvailRQCore
 *     responses:
 *       200:
 *         description: Availability response from source
 *       422:
 *         description: Validation error
 *       500:
 *         description: gRPC service error
 */
adminGrpcRouter.post('/source/availability', requireAuth(), requireCompanyType('ADMIN'), async (req, res, next) => {
    try {
        const body = availabilitySchema.parse(req.body);
        const { VehAvailRQCore, AgreementRef } = body;
        const { VehRentalCore } = VehAvailRQCore;
        // Transform OTA-style request to gRPC format
        const availabilityRequest = {
            pickup_unlocode: VehRentalCore.PickUpLocation.LocationCode,
            dropoff_unlocode: VehRentalCore.ReturnLocation.LocationCode,
            pickup_iso: VehRentalCore.PickUpDateTime,
            dropoff_iso: VehRentalCore.ReturnDateTime,
            agreement_ref: AgreementRef || ''
        };
        // Check gRPC service availability
        const isHealthy = await checkSourceHealth();
        if (!isHealthy) {
            return res.status(500).json({
                error: 'SERVICE_UNAVAILABLE',
                message: 'Source gRPC service is not available'
            });
        }
        // Call SourceProviderService.GetAvailability
        const sourceClient = getSourceProviderClient();
        const getAvailability = promisify(sourceClient.GetAvailability.bind(sourceClient));
        const response = await getAvailability(availabilityRequest);
        logger.info({ request: availabilityRequest }, 'Availability request completed');
        res.json(response);
    }
    catch (error) {
        logger.error({ error }, 'Source availability request failed');
        next(error);
    }
});
/**
 * @openapi
 * /admin/grpc/agent/ping:
 *   post:
 *     tags: [Admin, gRPC]
 *     summary: Ping agent gRPC service
 *     description: Checks agent service health via gRPC
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agentId:
 *                 type: string
 *                 description: Optional agent ID
 *     responses:
 *       200:
 *         description: Agent service health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 status:
 *                   type: string
 *       500:
 *         description: gRPC service error
 */
adminGrpcRouter.post('/agent/ping', requireAuth(), requireCompanyType('ADMIN'), async (req, res, next) => {
    try {
        const body = agentPingSchema.parse(req.body);
        const { agentId } = body;
        // Check gRPC service availability
        const isHealthy = await checkAgentHealth();
        if (!isHealthy) {
            return res.status(500).json({
                error: 'SERVICE_UNAVAILABLE',
                message: 'Agent gRPC service is not available'
            });
        }
        // Call Health.Check
        const healthClient = getAgentHealthClient();
        const check = promisify(healthClient.Check.bind(healthClient));
        const response = await check({ service: '' });
        logger.info({ agentId, status: response.status }, 'Agent ping completed');
        res.json({
            ok: true,
            status: response.status
        });
    }
    catch (error) {
        logger.error({ error }, 'Agent ping failed');
        next(error);
    }
});
/**
 * @openapi
 * /admin/grpc/agent/run-check:
 *   post:
 *     tags: [Admin, gRPC]
 *     summary: Run agent test check via gRPC
 *     description: Calls AgentTesterService.RunSearch with test parameters
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               search:
 *                 type: object
 *                 properties:
 *                   pickup_unlocode:
 *                     type: string
 *                   dropoff_unlocode:
 *                     type: string
 *                   pickup_iso:
 *                     type: string
 *                   dropoff_iso:
 *                     type: string
 *                   agreement_ref:
 *                     type: string
 *                 required:
 *                   - pickup_unlocode
 *                   - dropoff_unlocode
 *                   - pickup_iso
 *                   - dropoff_iso
 *                   - agreement_ref
 *             required:
 *               - search
 *     responses:
 *       200:
 *         description: Agent test run result
 *       422:
 *         description: Validation error
 *       500:
 *         description: gRPC service error
 */
adminGrpcRouter.post('/agent/run-check', requireAuth(), requireCompanyType('ADMIN'), async (req, res, next) => {
    try {
        const body = agentRunCheckSchema.parse(req.body);
        const { search } = body;
        // Check gRPC service availability
        const isHealthy = await checkAgentHealth();
        if (!isHealthy) {
            return res.status(500).json({
                error: 'SERVICE_UNAVAILABLE',
                message: 'Agent gRPC service is not available'
            });
        }
        // Call AgentTesterService.RunSearch
        const agentClient = getAgentTesterClient();
        const runSearch = promisify(agentClient.RunSearch.bind(agentClient));
        const response = await runSearch(search);
        logger.info({ search }, 'Agent run check completed');
        res.json(response);
    }
    catch (error) {
        logger.error({ error }, 'Agent run check failed');
        next(error);
    }
});
