import { prisma } from "../data/prisma.js";
import { logger } from "../infra/logger.js";

export type BookingHistoryEventType = 
  | "CREATED" 
  | "MODIFIED" 
  | "CANCELLED" 
  | "STATUS_CHANGED"
  | "PAYMENT_UPDATED"
  | "CUSTOMER_UPDATED";

export type BookingHistorySource = 
  | "AGENT" 
  | "SOURCE" 
  | "SYSTEM" 
  | "ADMIN";

export interface BookingHistoryEntry {
  bookingId: string;
  eventType: BookingHistoryEventType;
  changes?: Record<string, { before: any; after: any }>;
  beforeState?: any;
  afterState?: any;
  userId?: string;
  source?: BookingHistorySource;
  metadata?: Record<string, any>;
}

/**
 * Create a booking history entry
 */
export async function createBookingHistory(entry: BookingHistoryEntry): Promise<void> {
  try {
    await prisma.bookingHistory.create({
      data: {
        bookingId: entry.bookingId,
        eventType: entry.eventType,
        changes: entry.changes || undefined,
        beforeState: entry.beforeState || undefined,
        afterState: entry.afterState || undefined,
        userId: entry.userId || null,
        source: entry.source || "SYSTEM",
        metadata: entry.metadata || undefined,
      },
    });

    logger.debug(
      {
        bookingId: entry.bookingId,
        eventType: entry.eventType,
        source: entry.source,
      },
      "Booking history entry created"
    );
  } catch (error: any) {
    // Log error but don't throw - history tracking shouldn't break booking operations
    logger.error(
      {
        error: error.message,
        bookingId: entry.bookingId,
        eventType: entry.eventType,
      },
      "Failed to create booking history entry"
    );
  }
}

/**
 * Compare two booking states and extract field-level changes
 */
export function extractBookingChanges(
  before: any,
  after: any
): Record<string, { before: any; after: any }> {
  const changes: Record<string, { before: any; after: any }> = {};

  // Fields to track changes for
  const fieldsToTrack = [
    "status",
    "pickupUnlocode",
    "dropoffUnlocode",
    "pickupDateTime",
    "dropoffDateTime",
    "vehicleClass",
    "vehicleMakeModel",
    "ratePlanCode",
    "driverAge",
    "residencyCountry",
    "customerInfoJson",
    "paymentInfoJson",
    "supplierBookingRef",
    "agentBookingRef",
  ];

  for (const field of fieldsToTrack) {
    const beforeValue = before?.[field];
    const afterValue = after?.[field];

    // Deep comparison for JSON fields
    if (field.endsWith("Json")) {
      const beforeStr = JSON.stringify(beforeValue || {});
      const afterStr = JSON.stringify(afterValue || {});
      if (beforeStr !== afterStr) {
        changes[field] = { before: beforeValue, after: afterValue };
      }
    } else if (beforeValue !== afterValue) {
      changes[field] = { before: beforeValue, after: afterValue };
    }
  }

  return changes;
}

/**
 * Create booking snapshot (current state)
 */
export function createBookingSnapshot(booking: any): any {
  return {
    id: booking.id,
    agentId: booking.agentId,
    sourceId: booking.sourceId,
    agreementRef: booking.agreementRef,
    supplierBookingRef: booking.supplierBookingRef,
    agentBookingRef: booking.agentBookingRef,
    status: booking.status,
    availabilityRequestId: booking.availabilityRequestId,
    pickupUnlocode: booking.pickupUnlocode,
    dropoffUnlocode: booking.dropoffUnlocode,
    pickupDateTime: booking.pickupDateTime?.toISOString(),
    dropoffDateTime: booking.dropoffDateTime?.toISOString(),
    vehicleClass: booking.vehicleClass,
    vehicleMakeModel: booking.vehicleMakeModel,
    ratePlanCode: booking.ratePlanCode,
    driverAge: booking.driverAge,
    residencyCountry: booking.residencyCountry,
    customerInfoJson: booking.customerInfoJson,
    paymentInfoJson: booking.paymentInfoJson,
    createdAt: booking.createdAt?.toISOString(),
    updatedAt: booking.updatedAt?.toISOString(),
  };
}

/**
 * Record booking creation
 */
export async function recordBookingCreated(
  booking: any,
  userId?: string
): Promise<void> {
  const snapshot = createBookingSnapshot(booking);
  
  await createBookingHistory({
    bookingId: booking.id,
    eventType: "CREATED",
    afterState: snapshot,
    userId,
    source: "AGENT",
    metadata: {
      idempotencyKey: booking.idempotencyKey,
      availabilityRequestId: booking.availabilityRequestId,
    },
  });
}

/**
 * Record booking modification
 */
export async function recordBookingModified(
  bookingBefore: any,
  bookingAfter: any,
  userId?: string,
  modificationFields?: string[]
): Promise<void> {
  const beforeSnapshot = createBookingSnapshot(bookingBefore);
  const afterSnapshot = createBookingSnapshot(bookingAfter);
  const changes = extractBookingChanges(bookingBefore, bookingAfter);

  // If specific fields were modified, include in metadata
  const metadata: any = {};
  if (modificationFields && modificationFields.length > 0) {
    metadata.modifiedFields = modificationFields;
  }

  await createBookingHistory({
    bookingId: bookingAfter.id,
    eventType: "MODIFIED",
    changes,
    beforeState: beforeSnapshot,
    afterState: afterSnapshot,
    userId,
    source: "AGENT",
    metadata,
  });
}

/**
 * Record booking cancellation
 */
export async function recordBookingCancelled(
  booking: any,
  userId?: string,
  reason?: string
): Promise<void> {
  const snapshot = createBookingSnapshot(booking);
  
  await createBookingHistory({
    bookingId: booking.id,
    eventType: "CANCELLED",
    beforeState: snapshot,
    afterState: { ...snapshot, status: "CANCELLED" },
    userId,
    source: "AGENT",
    metadata: {
      reason: reason || "No reason provided",
    },
  });
}

/**
 * Record booking status change
 */
export async function recordBookingStatusChange(
  bookingBefore: any,
  bookingAfter: any,
  source: BookingHistorySource = "SOURCE",
  userId?: string
): Promise<void> {
  const beforeSnapshot = createBookingSnapshot(bookingBefore);
  const afterSnapshot = createBookingSnapshot(bookingAfter);
  const changes = extractBookingChanges(bookingBefore, bookingAfter);

  await createBookingHistory({
    bookingId: bookingAfter.id,
    eventType: "STATUS_CHANGED",
    changes: { status: changes.status || { before: bookingBefore.status, after: bookingAfter.status } },
    beforeState: beforeSnapshot,
    afterState: afterSnapshot,
    userId,
    source,
  });
}

/**
 * Get booking history for a booking
 */
export async function getBookingHistory(
  bookingId: string,
  options?: {
    eventType?: BookingHistoryEventType;
    limit?: number;
    offset?: number;
  }
) {
  const where: any = { bookingId };
  if (options?.eventType) {
    where.eventType = options.eventType;
  }

  const [entries, total] = await Promise.all([
    prisma.bookingHistory.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    }),
    prisma.bookingHistory.count({ where }),
  ]);

  return {
    entries,
    total,
    limit: options?.limit || 100,
    offset: options?.offset || 0,
  };
}

/**
 * Get booking history for multiple bookings (for agent dashboard)
 */
export async function getBookingsHistory(
  bookingIds: string[],
  options?: {
    eventType?: BookingHistoryEventType;
    limit?: number;
  }
) {
  const where: any = {
    bookingId: { in: bookingIds },
  };
  if (options?.eventType) {
    where.eventType = options.eventType;
  }

  const entries = await prisma.bookingHistory.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: options?.limit || 1000,
  });

  // Group by bookingId
  const grouped: Record<string, any[]> = {};
  for (const entry of entries) {
    if (!grouped[entry.bookingId]) {
      grouped[entry.bookingId] = [];
    }
    grouped[entry.bookingId].push(entry);
  }

  return grouped;
}

