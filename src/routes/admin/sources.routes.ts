import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../infra/auth.js';
import { requireCompanyType } from '../../infra/policies.js';
import { prisma } from '../../data/prisma.js';
import { logger } from '../../infra/logger.js';

export const adminSourcesRouter = Router();

// Validation schema for query parameters
const sourcesQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.string().transform(val => val ? Math.max(1, Math.min(100, Number(val))) : 25),
  cursor: z.string().optional()
});

/**
 * @openapi
 * /admin/sources:
 *   get:
 *     tags: [Admin, Sources]
 *     summary: List all source companies
 *     description: Get paginated list of companies with type='SOURCE' for UI pickers
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search query for company name
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 25
 *         description: Number of results per page
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor for pagination
 *     responses:
 *       200:
 *         description: List of source companies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       companyName:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [PENDING_VERIFICATION, ACTIVE, SUSPENDED]
 *                       grpcEndpoint:
 *                         type: string
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 next_cursor:
 *                   type: string
 *                 total:
 *                   type: number
 *                 has_more:
 *                   type: boolean
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
adminSourcesRouter.get('/sources', requireAuth(), requireCompanyType('ADMIN'), async (req, res, next) => {
  try {
    const { query, limit, cursor } = sourcesQuerySchema.parse(req.query);

    // Build where clause for filtering
    const whereClause: any = {
      type: 'SOURCE'
    };

    // Add search query if provided
    if (query) {
      whereClause.companyName = {
        contains: query,
        mode: 'insensitive'
      };
    }

    // Add cursor for pagination
    if (cursor) {
      whereClause.id = {
        gt: cursor
      };
    }

    // Get source companies with pagination
    const sources = await prisma.company.findMany({
      where: whereClause,
      select: {
        id: true,
        companyName: true,
        status: true,
        grpcEndpoint: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { id: 'asc' },
      take: limit + 1
    });

    const hasMore = sources.length > limit;
    const items = sources.slice(0, limit).map(source => ({
      id: source.id,
      companyName: source.companyName,
      status: source.status,
      grpcEndpoint: source.grpcEndpoint,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString()
    }));

    const next_cursor = hasMore ? sources[limit].id : '';

    logger.info({ 
      query, 
      limit, 
      cursor, 
      count: items.length, 
      hasMore 
    }, 'Admin sources list retrieved');

    res.json({
      items,
      next_cursor,
      total: items.length,
      has_more: hasMore
    });

  } catch (error) {
    logger.error({ error }, 'Admin sources list failed');
    next(error);
  }
});

/**
 * @openapi
 * /admin/sources/{sourceId}:
 *   get:
 *     tags: [Admin, Sources]
 *     summary: Get specific source company details
 *     description: Get detailed information about a specific source company
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Source company ID
 *     responses:
 *       200:
 *         description: Source company details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 companyName:
 *                   type: string
 *                 status:
 *                   type: string
 *                 grpcEndpoint:
 *                   type: string
 *                   nullable: true
 *                 email:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                 locationCount:
 *                   type: number
 *       404:
 *         description: Source not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
adminSourcesRouter.get('/sources/:sourceId', requireAuth(), requireCompanyType('ADMIN'), async (req, res, next) => {
  try {
    const sourceId = String(req.params.sourceId || '').trim();
    
    if (!sourceId) {
      return res.status(400).json({ 
        error: 'BAD_REQUEST', 
        message: 'Source ID is required' 
      });
    }

    // Get source company details
    const source = await prisma.company.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        companyName: true,
        status: true,
        grpcEndpoint: true,
        email: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!source) {
      return res.status(404).json({ 
        error: 'NOT_FOUND', 
        message: 'Source not found' 
      });
    }

    if ((source as any).type !== 'SOURCE') {
      return res.status(400).json({ 
        error: 'BAD_REQUEST', 
        message: 'Company is not a source' 
      });
    }

    // Get location count for this source
    const locationCount = await prisma.sourceLocation.count({
      where: { sourceId }
    });

    logger.info({ sourceId, locationCount }, 'Admin source details retrieved');

    res.json({
      ...source,
      locationCount,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString()
    });

  } catch (error) {
    logger.error({ error }, 'Admin source details failed');
    next(error);
  }
});
