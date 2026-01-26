import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { requireAuth } from "../../infra/auth.js";
import { requireRole, requireCompanyType } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";

export const supportRouter = Router();

// Configure multer for file uploads (memory storage for base64 conversion)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, GIF, and WEBP are allowed.'));
    }
  },
});

// Helper function to convert buffer to base64 data URL
function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

// Helper to determine sender type from user
function getSenderType(req: any): "ADMIN" | "AGENT" | "SOURCE" {
  if (req.user.role === "ADMIN") {
    return "ADMIN";
  }
  if (req.user.type === "AGENT") {
    return "AGENT";
  }
  if (req.user.type === "SOURCE") {
    return "SOURCE";
  }
  throw new Error("Invalid user type for support message");
}

/**
 * @openapi
 * /support/tickets:
 *   get:
 *     tags: [Support]
 *     summary: List support tickets
 *     description: |
 *       - Agents/Sources can only see their own tickets
 *       - Admins can see all tickets
 *     security:
 *       - bearerAuth: []
 */
// Support both /support/tickets and /api/support/tickets paths
supportRouter.get("/support/tickets", requireAuth(), async (req: any, res, next) => {
  try {
    // Check if Prisma client has been regenerated with support models
    if (!prisma.supportTicket || !prisma.supportMessage) {
      return res.status(503).json({
        error: "SERVICE_UNAVAILABLE",
        message: "Support models not available. Please restart the server after running 'npx prisma generate'",
      });
    }

    const isAdmin = req.user.role === "ADMIN";
    const status = req.query.status as string | undefined;
    const companyType = req.query.companyType as string | undefined;

    const where: any = {};
    
    // Non-admins can only see their own tickets
    if (!isAdmin) {
      where.createdById = req.user.companyId;
    }

    // Filter by status if provided
    if (status && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
      where.status = status;
    }

    // Filter by company type (admin only)
    if (isAdmin && companyType && ['AGENT', 'SOURCE'].includes(companyType)) {
      where.createdBy = {
        type: companyType,
      };
    }

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            companyName: true,
            type: true,
            email: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            createdAt: true,
            senderType: true,
            content: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    // Count unread messages for each ticket (admin sees unread from users, users see unread from admin)
    const ticketsWithUnread = await Promise.all(
      tickets.map(async (ticket) => {
        const unreadCount = await prisma.supportMessage.count({
          where: {
            ticketId: ticket.id,
            readAt: null,
            senderType: isAdmin ? { in: ['AGENT', 'SOURCE'] } : 'ADMIN',
          },
        });

        return {
          ...ticket,
          unreadCount,
          lastMessage: ticket.messages[0] || null,
          messageCount: ticket._count.messages,
        };
      })
    );

    res.json({
      items: ticketsWithUnread,
      total: ticketsWithUnread.length,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /support/tickets:
 *   post:
 *     tags: [Support]
 *     summary: Create a new support ticket
 *     description: Only Agents and Sources can create tickets
 *     security:
 *       - bearerAuth: []
 */
// Support both /support/tickets and /api/support/tickets paths
supportRouter.post(
  "/support/tickets",
  requireAuth(),
  requireCompanyType("AGENT", "SOURCE"),
  async (req: any, res, next) => {
    try {
      const schema = z.object({
        title: z.string().min(1).max(200),
        initialMessage: z.string().optional(),
      });

      const body = schema.parse(req.body);
      const companyId = req.user.companyId;

      const ticket = await prisma.supportTicket.create({
        data: {
          title: body.title,
          createdById: companyId,
          status: 'OPEN',
          messages: body.initialMessage
            ? {
                create: {
                  senderId: companyId,
                  senderType: req.user.type === "AGENT" ? "AGENT" : "SOURCE",
                  content: body.initialMessage,
                },
              }
            : undefined,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              companyName: true,
              type: true,
              email: true,
            },
          },
        },
      });

      res.status(201).json(ticket);
    } catch (e) {
      next(e);
    }
  }
);

/**
 * @openapi
 * /support/tickets/:id:
 *   get:
 *     tags: [Support]
 *     summary: Get ticket details
 *     security:
 *       - bearerAuth: []
 */
supportRouter.get("/support/tickets/:id", requireAuth(), async (req: any, res, next) => {
  try {
    const ticketId = req.params.id;
    const isAdmin = req.user.role === "ADMIN";
    const companyId = req.user.companyId;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        createdBy: {
          select: {
            id: true,
            companyName: true,
            type: true,
            email: true,
          },
        },
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Ticket not found" });
    }

    // Non-admins can only see their own tickets
    if (!isAdmin && ticket.createdById !== companyId) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Access denied" });
    }

    res.json(ticket);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /support/tickets/:id:
 *   put:
 *     tags: [Support]
 *     summary: Update ticket status (admin only)
 *     security:
 *       - bearerAuth: []
 */
supportRouter.put(
  "/support/tickets/:id",
  requireAuth(),
  requireRole("ADMIN"),
  async (req: any, res, next) => {
    try {
      const ticketId = req.params.id;
      const schema = z.object({
        status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
        assignedTo: z.string().optional(),
      });

      const body = schema.parse(req.body);
      const updateData: any = {};

      if (body.status) {
        updateData.status = body.status;
      }

      if (body.assignedTo !== undefined) {
        updateData.assignedTo = body.assignedTo || null;
      }

      const ticket = await prisma.supportTicket.update({
        where: { id: ticketId },
        data: updateData,
        include: {
          createdBy: {
            select: {
              id: true,
              companyName: true,
              type: true,
              email: true,
            },
          },
        },
      });

      res.json(ticket);
    } catch (e) {
      if ((e as any).code === 'P2025') {
        return res.status(404).json({ error: "NOT_FOUND", message: "Ticket not found" });
      }
      next(e);
    }
  }
);

/**
 * @openapi
 * /support/tickets/:id/messages:
 *   get:
 *     tags: [Support]
 *     summary: Get messages for a ticket
 *     security:
 *       - bearerAuth: []
 */
supportRouter.get("/support/tickets/:id/messages", requireAuth(), async (req: any, res, next) => {
  try {
    const ticketId = req.params.id;
    const isAdmin = req.user.role === "ADMIN";
    const companyId = req.user.companyId;

    // Verify ticket exists and user has access
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, createdById: true },
    });

    if (!ticket) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Ticket not found" });
    }

    if (!isAdmin && ticket.createdById !== companyId) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Access denied" });
    }

    const messages = await prisma.supportMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      items: messages,
      total: messages.length,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /support/tickets/:id/messages:
 *   post:
 *     tags: [Support]
 *     summary: Send a message in a ticket (supports image upload)
 *     security:
 *       - bearerAuth: []
 */
supportRouter.post(
  "/support/tickets/:id/messages",
  requireAuth(),
  // Debug middleware before multer
  (req: any, res: any, next: any) => {
    console.log('[Support Route] BEFORE multer:', {
      method: req.method,
      url: req.url,
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length'],
      hasBody: !!req.body,
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      bodyValue: req.body,
      // Check if body is a stream or buffer
      bodyIsStream: req.body && typeof req.body.pipe === 'function',
      bodyIsBuffer: Buffer.isBuffer(req.body),
    });
    next();
  },
  // Multer middleware - this should parse multipart/form-data
  upload.single('image'),
  // Debug middleware after multer
  (req: any, res: any, next: any) => {
    console.log('[Support Route] AFTER multer:', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      bodyContent: req.body,
      bodyType: typeof req.body,
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      fileMimetype: req.file?.mimetype,
      // Check multer errors
      multerError: (req as any).multerError,
    });
    next();
  },
  async (req: any, res, next) => {
    try {
      const ticketId = req.params.id;
      const isAdmin = req.user.role === "ADMIN";
      const companyId = req.user.companyId;
      const senderId = isAdmin ? (req.user.sub || req.user.id || companyId) : companyId;

      // Verify ticket exists and user has access
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
        select: { id: true, createdById: true, status: true },
      });

      if (!ticket) {
        return res.status(404).json({ error: "NOT_FOUND", message: "Ticket not found" });
      }

      if (!isAdmin && ticket.createdById !== companyId) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Access denied" });
      }

      // Don't allow messages on closed tickets
      if (ticket.status === 'CLOSED') {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Cannot send messages to closed tickets" });
      }

      // Debug logging BEFORE parsing to see raw request
      console.log('[Support Route] Raw request:', {
        method: req.method,
        url: req.url,
        headers: {
          'content-type': req.headers['content-type'],
          'content-length': req.headers['content-length'],
          'authorization': req.headers['authorization'] ? 'present' : 'missing',
        },
        bodyType: typeof req.body,
        bodyIsEmpty: !req.body || Object.keys(req.body || {}).length === 0,
      });

      const content = req.body?.content as string | undefined;
      const file = req.file;

      // Debug logging to understand what's being received
      console.log('[Support Route] Parsed request:', {
        hasContent: content !== undefined,
        contentValue: content,
        contentType: typeof content,
        contentLength: content?.length,
        hasFile: !!file,
        fileName: file?.originalname,
        fileSize: file?.size,
        fileMimetype: file?.mimetype,
        bodyKeys: Object.keys(req.body || {}),
        bodyContent: req.body,
        rawBody: req.body,
      });

      // Check if we have content (even empty string is valid) or file
      // Empty string IS valid content when we have a file
      // We only need content OR file, not both
      const hasContent = content !== undefined && content !== null;
      const hasFile = !!file;

      // Accept if we have either content (even empty string) or file
      if (!hasContent && !hasFile) {
        return res.status(400).json({ 
          error: "BAD_REQUEST", 
          message: "Either content or image is required",
          debug: {
            hasContent,
            hasFile,
            contentValue: content,
            contentType: typeof content,
            bodyKeys: Object.keys(req.body || {}),
            bodyContent: req.body,
            fileInfo: file ? {
              name: file.originalname,
              size: file.size,
              mimetype: file.mimetype,
            } : null,
          }
        });
      }

      let imageUrl: string | undefined;
      if (file) {
        imageUrl = bufferToDataUrl(file.buffer, file.mimetype);
      }

      const senderType = getSenderType(req);

      const message = await prisma.supportMessage.create({
        data: {
          ticketId,
          senderId,
          senderType,
          content: content || null,
          imageUrl: imageUrl || null,
        },
      });

      // Update ticket's updatedAt timestamp
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() },
      });

      // If ticket is resolved, mark as in progress when new message is sent
      if (ticket.status === 'RESOLVED') {
        await prisma.supportTicket.update({
          where: { id: ticketId },
          data: { status: 'IN_PROGRESS' },
        });
      }

      res.status(201).json(message);
    } catch (e) {
      if (e instanceof multer.MulterError) {
        if (e.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: "BAD_REQUEST", message: "File size exceeds 5MB limit" });
        }
        return res.status(400).json({ error: "BAD_REQUEST", message: e.message });
      }
      next(e);
    }
  }
);

/**
 * @openapi
 * /support/tickets/:id/messages/:messageId/read:
 *   post:
 *     tags: [Support]
 *     summary: Mark a message as read
 *     security:
 *       - bearerAuth: []
 */
supportRouter.post(
  "/support/tickets/:id/messages/:messageId/read",
  requireAuth(),
  async (req: any, res, next) => {
    try {
      const ticketId = req.params.id;
      const messageId = req.params.messageId;
      const isAdmin = req.user.role === "ADMIN";
      const companyId = req.user.companyId;

      // Verify ticket exists and user has access
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
        select: { id: true, createdById: true },
      });

      if (!ticket) {
        return res.status(404).json({ error: "NOT_FOUND", message: "Ticket not found" });
      }

      if (!isAdmin && ticket.createdById !== companyId) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Access denied" });
      }

      // Verify message exists and belongs to ticket
      const message = await prisma.supportMessage.findUnique({
        where: { id: messageId },
        select: { id: true, ticketId: true, senderType: true, readAt: true },
      });

      if (!message) {
        return res.status(404).json({ error: "NOT_FOUND", message: "Message not found" });
      }

      if (message.ticketId !== ticketId) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Message does not belong to this ticket" });
      }

      // Only mark as read if it's from the other party (admin reads user messages, users read admin messages)
      const shouldMarkRead =
        (isAdmin && (message.senderType === 'AGENT' || message.senderType === 'SOURCE')) ||
        (!isAdmin && message.senderType === 'ADMIN');

      if (shouldMarkRead && !message.readAt) {
        await prisma.supportMessage.update({
          where: { id: messageId },
          data: { readAt: new Date() },
        });
      }

      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }
);
