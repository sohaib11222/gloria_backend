import { prisma } from "../data/prisma.js";
import { redactPII } from "../infra/redact.js";
export async function auditLog(params) {
    try {
        // Ensure we capture ALL data - no truncation
        const requestData = params.request ? redactPII(params.request) : null;
        const responseData = params.response ? redactPII(params.response) : null;
        await prisma.auditLog.create({
            data: {
                direction: params.direction,
                endpoint: params.endpoint,
                requestId: params.requestId,
                companyId: params.companyId,
                sourceId: params.sourceId,
                agreementRef: params.agreementRef, // [AUTO-AUDIT]
                httpStatus: params.httpStatus || null,
                grpcStatus: params.grpcStatus || null,
                maskedRequest: requestData,
                maskedResponse: responseData,
                durationMs: params.durationMs || null
            }
        });
    }
    catch (error) {
        // Don't throw - we don't want audit logging failures to break the main flow
        // Silently fail audit logging
    }
}
// Convenience wrapper specifically for booking operations
export async function logBooking(params) {
    const endpoint = `booking.${params.operation}`;
    await auditLog({
        direction: "IN",
        endpoint,
        requestId: params.requestId,
        companyId: params.agentId,
        sourceId: params.sourceId,
        agreementRef: params.agreementRef,
        httpStatus: params.statusCode && params.statusCode >= 100 ? params.statusCode : undefined,
        grpcStatus: params.grpcStatus,
        request: params.requestPayload,
        response: params.responsePayload,
        durationMs: params.durationMs,
    });
}
