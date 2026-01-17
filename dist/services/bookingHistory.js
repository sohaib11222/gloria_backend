import { prisma } from "../data/prisma.js";
import { logger } from "../infra/logger.js";
/**
 * Create a booking history entry
 */
export async function createBookingHistory(entry) {
    try {
        await prisma.bookingHistory.create({
            data: {
                bookingId: entry.bookingId,
                eventType: entry.eventType,
<<<<<<< HEAD
                changes: entry.changes || null,
                beforeState: entry.beforeState || null,
                afterState: entry.afterState || null,
                userId: entry.userId || null,
                source: entry.source || "SYSTEM",
                metadata: entry.metadata || null,
=======
                changes: entry.changes || undefined,
                beforeState: entry.beforeState || undefined,
                afterState: entry.afterState || undefined,
                userId: entry.userId || null,
                source: entry.source || "SYSTEM",
                metadata: entry.metadata || undefined,
>>>>>>> fa252dd5bb55fd72f1abf8a948f6d61af9d3b991
            },
        });
        logger.debug({
            bookingId: entry.bookingId,
            eventType: entry.eventType,
            source: entry.source,
        }, "Booking history entry created");
    }
    catch (error) {
        // Log error but don't throw - history tracking shouldn't break booking operations
        logger.error({
            error: error.message,
            bookingId: entry.bookingId,
            eventType: entry.eventType,
        }, "Failed to create booking history entry");
    }
}
/**
 * Compare two booking states and extract field-level changes
 */
export function extractBookingChanges(before, after) {
    const changes = {};
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
        }
        else if (beforeValue !== afterValue) {
            changes[field] = { before: beforeValue, after: afterValue };
        }
    }
    return changes;
}
/**
 * Create booking snapshot (current state)
 */
export function createBookingSnapshot(booking) {
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
export async function recordBookingCreated(booking, userId) {
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
export async function recordBookingModified(bookingBefore, bookingAfter, userId, modificationFields) {
    const beforeSnapshot = createBookingSnapshot(bookingBefore);
    const afterSnapshot = createBookingSnapshot(bookingAfter);
    const changes = extractBookingChanges(bookingBefore, bookingAfter);
    // If specific fields were modified, include in metadata
    const metadata = {};
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
export async function recordBookingCancelled(booking, userId, reason) {
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
export async function recordBookingStatusChange(bookingBefore, bookingAfter, source = "SOURCE", userId) {
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
export async function getBookingHistory(bookingId, options) {
    const where = { bookingId };
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
export async function getBookingsHistory(bookingIds, options) {
    const where = {
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
    const grouped = {};
    for (const entry of entries) {
        if (!grouped[entry.bookingId]) {
            grouped[entry.bookingId] = [];
        }
        grouped[entry.bookingId].push(entry);
    }
    return grouped;
}
