import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType, requireRole } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";
import { GrpcTester } from "../../services/grpcTester.js";
import { normalizeWhitelist } from "../../infra/whitelistEnforcement.js";

export const endpointsRouter = Router();

// Schema for endpoint configuration
const endpointConfigSchema = z.object({
  httpEndpoint: z.string().url().optional(),
  grpcEndpoint: z.string().optional(),
  adapterType: z.enum(["mock", "grpc", "http"]).optional(),
  description: z.string().optional(),
});

/**
 * @openapi
 * /endpoints/config:
 *   get:
 *     tags: [Endpoints]
 *     summary: Get company's endpoint configuration
 *     description: Retrieve the current HTTP and gRPC endpoint configuration for the authenticated company
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current endpoint configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 companyId:
 *                   type: string
 *                   description: Company ID
 *                 companyName:
 *                   type: string
 *                   description: Company name
 *                 type:
 *                   type: string
 *                   enum: [AGENT, SOURCE]
 *                   description: Company type
 *                 httpEndpoint:
 *                   type: string
 *                   description: HTTP endpoint URL
 *                 grpcEndpoint:
 *                   type: string
 *                   description: gRPC endpoint address
 *                 adapterType:
 *                   type: string
 *                   enum: [mock, grpc, http]
 *                   description: Adapter type
 *                 description:
 *                   type: string
 *                   description: Endpoint description
 *                 status:
 *                   type: string
 *                   enum: [ACTIVE, PENDING_VERIFICATION, SUSPENDED]
 *                   description: Company status
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: Last update time
 */
endpointsRouter.get(
  "/endpoints/config",
  requireAuth(),
  async (req: any, res, next) => {
    try {
      // Validate that user has companyId
      if (!req.user?.companyId) {
        return res.status(401).json({
          error: "AUTH_ERROR",
          message: "Invalid authentication: companyId not found in token",
        });
      }

      const company = await prisma.company.findUnique({
        where: { id: req.user.companyId },
        select: {
          id: true,
          companyName: true,
          type: true,
          status: true,
          adapterType: true,
          grpcEndpoint: true,
          httpEndpoint: true,
          updatedAt: true,
          lastGrpcTestResult: true,
          lastGrpcTestAt: true,
          lastLocationSyncAt: true,
        },
      });

      if (!company) {
        return res
          .status(404)
          .json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
      }

      // Use configured httpEndpoint or fallback to default based on company type
      const httpEndpoint =
        company.httpEndpoint ||
        (company.type === "AGENT"
          ? `http://localhost:9091` // Agent HTTP port
          : `http://localhost:9090`); // Source HTTP port

      res.json({
        companyId: company.id,
        companyName: company.companyName,
        type: company.type,
        httpEndpoint,
        grpcEndpoint: company.grpcEndpoint || null,
        adapterType: company.adapterType,
        description: `${
          company.companyName
        } ${company.type.toLowerCase()} endpoints`,
        status: company.status,
        updatedAt: company.updatedAt,
        lastGrpcTestResult: company.lastGrpcTestResult,
        lastGrpcTestAt: company.lastGrpcTestAt,
        lastLocationSyncAt: company.lastLocationSyncAt,
      });
    } catch (e: any) {
      // Log the error for debugging
      console.error("Error in GET /endpoints/config:", e);
      console.error("Request user:", req.user);
      
      // Handle database errors
      if (e?.code && e.code.startsWith('P')) {
        return res.status(500).json({
          error: "DATABASE_ERROR",
          message: "Database query failed",
          code: e.code
        });
      }
      
      // Handle MySQL authentication errors
      if (e?.message && e.message.includes('Access denied')) {
        return res.status(503).json({
          error: "DATABASE_AUTH_ERROR",
          message: "Database authentication failed. Please check your DATABASE_URL in .env file."
        });
      }
      
      next(e);
    }
  }
);

/**
 * @openapi
 * /endpoints/config:
 *   put:
 *     tags: [Endpoints]
 *     summary: Update company's endpoint configuration
 *     description: Update HTTP and gRPC endpoint configuration for the authenticated company
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               httpEndpoint:
 *                 type: string
 *                 format: uri
 *                 description: HTTP endpoint URL
 *                 example: "http://localhost:9091"
 *               grpcEndpoint:
 *                 type: string
 *                 description: gRPC endpoint address
 *                 example: "localhost:51062"
 *               adapterType:
 *                 type: string
 *                 enum: [mock, grpc, http]
 *                 description: Adapter type
 *                 example: "grpc"
 *               description:
 *                 type: string
 *                 description: Endpoint description
 *                 example: "Production agent endpoints"
 *     responses:
 *       200:
 *         description: Endpoint configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Success message
 *                 companyId:
 *                   type: string
 *                   description: Company ID
 *                 httpEndpoint:
 *                   type: string
 *                   description: Updated HTTP endpoint
 *                 grpcEndpoint:
 *                   type: string
 *                   description: Updated gRPC endpoint
 *                 adapterType:
 *                   type: string
 *                   description: Updated adapter type
 *       400:
 *         description: Invalid configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "INVALID_CONFIG"
 *                 message:
 *                   type: string
 *                   example: "Invalid endpoint configuration"
 */
endpointsRouter.put(
  "/endpoints/config",
  requireAuth(),
  async (req: any, res, next) => {
    try {
      const body = endpointConfigSchema.parse(req.body);

      // Validate gRPC endpoint format if provided
      if (body.grpcEndpoint) {
        const grpcPattern = /^[a-zA-Z0-9.-]+:\d+$/;
        if (!grpcPattern.test(body.grpcEndpoint)) {
          return res.status(400).json({
            error: "INVALID_GRPC_ENDPOINT",
            message:
              "gRPC endpoint must be in format 'host:port' (e.g., 'localhost:51062')",
          });
        }
      }

      // Validate HTTP endpoint format if provided
      if (body.httpEndpoint) {
        try {
          new URL(body.httpEndpoint);
        } catch {
          return res.status(400).json({
            error: "INVALID_HTTP_ENDPOINT",
            message:
              "HTTP endpoint must be a valid URL (e.g., 'http://localhost:9091')",
          });
        }
      }

      // Update company configuration
      const updatedCompany = await prisma.company.update({
        where: { id: req.user.companyId },
        data: {
          adapterType: body.adapterType,
          grpcEndpoint: body.grpcEndpoint,
          httpEndpoint: body.httpEndpoint,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          companyName: true,
          type: true,
          adapterType: true,
          grpcEndpoint: true,
          httpEndpoint: true,
          updatedAt: true,
        },
      });

      res.json({
        message: "Endpoint configuration updated successfully",
        companyId: updatedCompany.id,
        httpEndpoint:
          updatedCompany.httpEndpoint ||
          (updatedCompany.type === "AGENT"
            ? "http://localhost:9091"
            : "http://localhost:9090"),
        grpcEndpoint: updatedCompany.grpcEndpoint,
        adapterType: updatedCompany.adapterType,
        updatedAt: updatedCompany.updatedAt,
      });
    } catch (e: any) {
      if (e.name === "ZodError") {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: e.errors,
        });
      }
      next(e);
    }
  }
);

/**
 * @openapi
 * /endpoints/test:
 *   post:
 *     tags: [Endpoints]
 *     summary: Test company's endpoint connectivity
 *     description: Test the connectivity and health of the company's configured endpoints
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               testHttp:
 *                 type: boolean
 *                 description: Whether to test HTTP endpoint
 *                 default: true
 *               testGrpc:
 *                 type: boolean
 *                 description: Whether to test gRPC endpoint
 *                 default: true
 *     responses:
 *       200:
 *         description: Endpoint test results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 companyId:
 *                   type: string
 *                   description: Company ID
 *                 results:
 *                   type: object
 *                   properties:
 *                     http:
 *                       type: object
 *                       properties:
 *                         endpoint:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [success, failed, skipped]
 *                         responseTime:
 *                           type: number
 *                         message:
 *                           type: string
 *                     grpc:
 *                       type: object
 *                       properties:
 *                         endpoint:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [success, failed, skipped]
 *                         responseTime:
 *                           type: number
 *                         message:
 *                           type: string
 *                 overallStatus:
 *                   type: string
 *                   enum: [healthy, partial, unhealthy]
 *                   description: Overall endpoint health status
 */
endpointsRouter.post(
  "/endpoints/test",
  requireAuth(),
  async (req: any, res, next) => {
    try {
      const { testHttp = true, testGrpc = true } = req.body || {};

      const company = await prisma.company.findUnique({
        where: { id: req.user.companyId },
        select: {
          id: true,
          type: true,
          adapterType: true,
          grpcEndpoint: true,
        },
      });

      if (!company) {
        return res
          .status(404)
          .json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
      }

      const results: any = {};
      let overallStatus = "healthy";

      // Test HTTP endpoint
      if (testHttp) {
        const httpStart = Date.now();
        try {
          // Use ports that don't conflict with main API (8080) and gRPC servers (50051, 50052)
          const httpEndpoint =
            company.type === "AGENT"
              ? "http://localhost:9091/health"
              : "http://localhost:9090/health";

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(httpEndpoint, {
            method: "GET",
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);

          const httpTime = Date.now() - httpStart;

          if (response.ok) {
            results.http = {
              endpoint: httpEndpoint,
              status: "success",
              responseTime: httpTime,
              message: "HTTP endpoint is responding",
            };
          } else {
            results.http = {
              endpoint: httpEndpoint,
              status: "failed",
              responseTime: httpTime,
              message: `HTTP endpoint returned status ${response.status}`,
            };
            overallStatus = "partial";
          }
        } catch (error: any) {
          const httpTime = Date.now() - httpStart;
          results.http = {
            endpoint:
              company.type === "AGENT"
                ? "http://localhost:9091/health"
                : "http://localhost:9090/health",
            status: "failed",
            responseTime: httpTime,
            message: `HTTP endpoint test failed: ${error.message}`,
          };
          overallStatus = "partial";
        }
      } else {
        results.http = {
          endpoint: "N/A",
          status: "skipped",
          responseTime: 0,
          message: "HTTP test skipped",
        };
      }

      // Test gRPC endpoint
      if (testGrpc && company.grpcEndpoint) {
        try {
          // Validate gRPC endpoint format first
          const validation = GrpcTester.validateGrpcEndpoint(company.grpcEndpoint);
          if (!validation.valid) {
            results.grpc = {
              endpoint: company.grpcEndpoint,
              status: "failed",
              responseTime: 0,
              message: validation.error || "Invalid gRPC endpoint format",
            };
            overallStatus = overallStatus === "healthy" ? "partial" : "unhealthy";
          } else {
            // Perform actual gRPC connectivity test
            // Handle port conflicts by using alternative ports if needed
            const grpcResult = await GrpcTester.testGrpcEndpoint(company.grpcEndpoint);
            results.grpc = grpcResult;
            
            if (grpcResult.status === "failed") {
              overallStatus = overallStatus === "healthy" ? "partial" : "unhealthy";
            }
          }
        } catch (error: any) {
          results.grpc = {
            endpoint: company.grpcEndpoint,
            status: "failed",
            responseTime: 0,
            message: `gRPC endpoint test failed: ${error.message}`,
            details: {
              error: error.message,
              note: "Check if gRPC server is running and port is available"
            }
          };
          overallStatus = overallStatus === "healthy" ? "partial" : "unhealthy";
        }
      } else if (testGrpc) {
        results.grpc = {
          endpoint: "Not configured",
          status: "skipped",
          responseTime: 0,
          message: "gRPC endpoint not configured",
        };
      } else {
        results.grpc = {
          endpoint: "N/A",
          status: "skipped",
          responseTime: 0,
          message: "gRPC test skipped",
        };
      }

      res.json({
        companyId: company.id,
        results,
        overallStatus,
      });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * @openapi
 * /endpoints/status:
 *   get:
 *     tags: [Endpoints]
 *     summary: Get endpoint status and health
 *     description: Get the current status and health information for the company's endpoints
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Endpoint status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 companyId:
 *                   type: string
 *                   description: Company ID
 *                 endpoints:
 *                   type: object
 *                   properties:
 *                     http:
 *                       type: object
 *                       properties:
 *                         configured:
 *                           type: boolean
 *                         endpoint:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, inactive, unknown]
 *                     grpc:
 *                       type: object
 *                       properties:
 *                         configured:
 *                           type: boolean
 *                         endpoint:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, inactive, unknown]
 *                 adapterType:
 *                   type: string
 *                   description: Current adapter type
 *                 lastChecked:
 *                   type: string
 *                   format: date-time
 *                   description: Last health check time
 */
endpointsRouter.get(
  "/endpoints/status",
  requireAuth(),
  async (req: any, res, next) => {
    try {
      const company = await prisma.company.findUnique({
        where: { id: req.user.companyId },
        select: {
          id: true,
          type: true,
          adapterType: true,
          grpcEndpoint: true,
          updatedAt: true,
        },
      });

      if (!company) {
        return res
          .status(404)
          .json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
      }

      // Use ports that don't conflict with main API (8080) and gRPC servers (50051, 50052)
      const httpEndpoint =
        company.type === "AGENT"
          ? "http://localhost:9091"
          : "http://localhost:9090";

      res.json({
        companyId: company.id,
        endpoints: {
          http: {
            configured: true,
            endpoint: httpEndpoint,
            status: "active", // Assume active for now
          },
          grpc: {
            configured: !!company.grpcEndpoint,
            endpoint: company.grpcEndpoint || null,
            status: company.grpcEndpoint ? "active" : "inactive",
          },
        },
        adapterType: company.adapterType,
        lastChecked: new Date().toISOString(),
      });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * @openapi
 * /endpoints/reset:
 *   post:
 *     tags: [Endpoints]
 *     summary: Reset endpoint configuration to defaults
 *     description: Reset the company's endpoint configuration to default values
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Endpoint configuration reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Success message
 *                 companyId:
 *                   type: string
 *                   description: Company ID
 *                 defaultConfig:
 *                   type: object
 *                   properties:
 *                     httpEndpoint:
 *                       type: string
 *                       description: Default HTTP endpoint
 *                     grpcEndpoint:
 *                       type: string
 *                       description: Default gRPC endpoint (null if not configured)
 *                     adapterType:
 *                       type: string
 *                       description: Default adapter type
 */
/**
 * @openapi
 * /endpoints/notifications:
 *   get:
 *     tags: [Endpoints]
 *     summary: Get source notifications
 *     description: Retrieve notifications for the authenticated source company
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of notifications to return
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Return only unread notifications
 *     responses:
 *       200:
 *         description: List of notifications
 */
endpointsRouter.get("/endpoints/notifications", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
  try {
    const companyId = req.user.company.id;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
    const unreadOnly = req.query.unreadOnly === 'true';
    
    const notifications: any[] = [];
    
    // 1. Get health issues (excluded sources)
    const health = await prisma.sourceHealth.findUnique({
      where: { sourceId: companyId },
    });
    
    if (health && health.excludedUntil && new Date(health.excludedUntil).getTime() > Date.now()) {
      notifications.push({
        id: `health-excluded-${companyId}`,
        type: 'health',
        title: 'Source excluded due to health issues',
        message: `Your source has been excluded until ${new Date(health.excludedUntil).toLocaleString()}. Please check your endpoint performance.`,
        timestamp: health.excludedUntil.toISOString(),
        read: false,
        actionUrl: '/health',
      });
    }
    
    // 2. Get agreement status updates
    const recentAgreements = await prisma.agreement.findMany({
      where: {
        sourceId: companyId,
        status: { in: ['ACCEPTED', 'REJECTED', 'ACTIVE'] },
      },
      include: {
        agent: {
          select: {
            companyName: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    
    recentAgreements.forEach(agreement => {
      if (agreement.status === 'ACCEPTED' || agreement.status === 'ACTIVE') {
        notifications.push({
          id: `agreement-${agreement.status.toLowerCase()}-${agreement.id}`,
          type: 'agreement',
          title: `Agreement ${agreement.status.toLowerCase()}`,
          message: `${agreement.agent.companyName} has ${agreement.status === 'ACCEPTED' ? 'accepted' : 'activated'} your agreement: ${agreement.agreementRef}`,
          timestamp: agreement.updatedAt.toISOString(),
          read: false,
          actionUrl: '/agreements',
        });
      }
    });
    
    // 3. Get database notifications for this company
    const dbNotifications = await prisma.notification.findMany({
      where: {
        companyId: companyId,
        ...(unreadOnly && { readAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    
    dbNotifications.forEach(notif => {
      let frontendType: 'agreement' | 'health' | 'company' | 'system' = 'system';
      if (notif.type.includes('AGREEMENT')) {
        frontendType = 'agreement';
      } else if (notif.type.includes('HEALTH') || notif.type.includes('EXCLUDED')) {
        frontendType = 'health';
      } else if (notif.type.includes('COMPANY')) {
        frontendType = 'company';
      }
      
      notifications.push({
        id: notif.id,
        type: frontendType,
        title: notif.title,
        message: notif.message,
        timestamp: notif.createdAt.toISOString(),
        read: !!notif.readAt,
        actionUrl: frontendType === 'agreement' ? '/agreements' : 
                   frontendType === 'health' ? '/health' : '/dashboard',
      });
    });
    
    // Sort by timestamp (newest first) and limit
    const sortedNotifications = notifications
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
    
    res.json({
      items: sortedNotifications,
      total: sortedNotifications.length,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /endpoints/notifications/{id}/read:
 *   post:
 *     tags: [Endpoints]
 *     summary: Mark source notification as read
 *     security:
 *       - bearerAuth: []
 */
endpointsRouter.post("/endpoints/notifications/:id/read", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
  try {
    const { id } = req.params;
    const companyId = req.user.company.id;
    
    // If it's a database notification, update it
    if (id.startsWith('cl')) {
      await prisma.notification.updateMany({
        where: { 
          id,
          companyId: companyId, // Ensure it belongs to this company
        },
        data: { readAt: new Date() },
      });
    }
    
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

endpointsRouter.post(
  "/endpoints/reset",
  requireAuth(),
  async (req: any, res, next) => {
    try {
      const company = await prisma.company.findUnique({
        where: { id: req.user.companyId },
        select: { id: true, type: true },
      });

      if (!company) {
        return res
          .status(404)
          .json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
      }

      // Reset to default values
      const updatedCompany = await prisma.company.update({
        where: { id: req.user.companyId },
        data: {
          adapterType: "mock",
          grpcEndpoint: null,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          adapterType: true,
          grpcEndpoint: true,
        },
      });

      // Use ports that don't conflict with main API (8080) and gRPC servers (50051, 50052)
      const defaultHttpEndpoint =
        company.type === "AGENT"
          ? "http://localhost:9091"
          : "http://localhost:9090";

      res.json({
        message: "Endpoint configuration reset to defaults",
        companyId: updatedCompany.id,
        defaultConfig: {
          httpEndpoint: defaultHttpEndpoint,
          grpcEndpoint: null,
          adapterType: "mock",
        },
      });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * @openapi
 * /settings:
 *   get:
 *     tags: [Settings]
 *     summary: Get company settings including whitelist
 *     security:
 *       - bearerAuth: []
 */
endpointsRouter.get("/settings", requireAuth(), async (req: any, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: {
        id: true,
        companyName: true,
        whitelistedDomains: true,
        companyCode: true,
      },
    });

    if (!company) {
      return res.status(404).json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
    }

    res.json({
      companyId: company.id,
      companyName: company.companyName,
      companyCode: company.companyCode,
      whitelistedDomains: company.whitelistedDomains
        ? normalizeWhitelist(company.whitelistedDomains)
        : [],
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /settings/whitelist:
 *   post:
 *     tags: [Settings]
 *     summary: Update company whitelist
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [domains]
 *             properties:
 *               domains:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of domains/IPs to whitelist (comma-separated string also accepted)
 */
endpointsRouter.post("/settings/whitelist", requireAuth(), async (req: any, res, next) => {
  try {
    const schema = z.object({
      domains: z.union([
        z.array(z.string()),
        z.string().transform((s) => s.split(',').map((d) => d.trim()).filter(Boolean)),
      ]),
    });

    const { domains } = schema.parse(req.body);
    const whitelistString = Array.isArray(domains) ? domains.join(',') : domains;

    // Normalize and validate
    const normalized = normalizeWhitelist(whitelistString);
    const finalWhitelist = normalized.join(',');

    const updatedCompany = await prisma.company.update({
      where: { id: req.user.companyId },
      data: { whitelistedDomains: finalWhitelist || null },
      select: {
        id: true,
        companyName: true,
        whitelistedDomains: true,
      },
    });

    res.json({
      message: "Whitelist updated successfully",
      whitelistedDomains: normalizeWhitelist(updatedCompany.whitelistedDomains),
    });
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: e.errors,
      });
    }
    next(e);
  }
});

/**
 * @openapi
 * /endpoints/setup-status:
 *   get:
 *     tags: [Endpoints]
 *     summary: Get agent setup completion status
 *     description: Check which setup steps have been completed (endpoints, booking test, agreements)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Setup status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 endpointsConfigured:
 *                   type: boolean
 *                   description: Whether HTTP and gRPC endpoints are configured
 *                 bookingTestCompleted:
 *                   type: boolean
 *                   description: Whether booking test has been completed
 *                 agreementAccepted:
 *                   type: boolean
 *                   description: Whether at least one agreement has been accepted
 *                 allComplete:
 *                   type: boolean
 *                   description: Whether all setup steps are complete
 */
endpointsRouter.get(
  "/endpoints/setup-status",
  requireAuth(),
  async (req: any, res, next) => {
    try {
      const company = await prisma.company.findUnique({
        where: { id: req.user.companyId },
        select: {
          id: true,
          type: true,
          httpEndpoint: true,
          grpcEndpoint: true,
        },
      });

      if (!company) {
        return res
          .status(404)
          .json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
      }

      // Check endpoint configuration
      const endpointsConfigured = !!(company.httpEndpoint && company.grpcEndpoint);

      // Check booking test completion (check verification status)
      let bookingTestCompleted = false;
      try {
        const verification = await prisma.verificationReport.findFirst({
          where: {
            companyId: company.id,
            kind: "AGENT",
            passed: true,
          },
          orderBy: { createdAt: "desc" },
        });
        bookingTestCompleted = !!verification;
      } catch (e) {
        console.error("Failed to check verification status:", e);
      }

      // Check agreement acceptance
      let agreementAccepted = false;
      try {
        const acceptedAgreement = await prisma.agreement.findFirst({
          where: {
            agentId: company.id,
            status: "ACCEPTED",
          },
        });
        agreementAccepted = !!acceptedAgreement;
      } catch (e) {
        console.error("Failed to check agreement status:", e);
      }

      const allComplete = endpointsConfigured && bookingTestCompleted && agreementAccepted;

      res.json({
        endpointsConfigured,
        bookingTestCompleted,
        agreementAccepted,
        allComplete,
      });
    } catch (e) {
      next(e);
    }
  }
);
