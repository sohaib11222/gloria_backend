import { prisma } from "../data/prisma.js";
import { redactPII } from "../infra/redact.js";

export async function auditLog(params: {
  direction: "IN" | "OUT";
  endpoint?: string;
  requestId?: string;
  companyId?: string;
  sourceId?: string;
  agreementRef?: string; // [AUTO-AUDIT] Allow explicit agreement_ref capture
  httpStatus?: number;
  grpcStatus?: number;
  request?: any;
  response?: any;
  durationMs?: number;
}) {
  try {
    // Ensure we capture ALL data - no truncation
    const requestData = params.request ? redactPII(params.request) : null;
    const responseData = params.response ? redactPII(params.response) : null;
    
    // Log the data sizes for debugging
    console.log(`Audit Log - Request size: ${requestData?.length || 0} chars, Response size: ${responseData?.length || 0} chars`);
    
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
    
    console.log(`✅ Audit log created successfully for ${params.endpoint}`);
  } catch (error) {
    console.error('❌ Failed to create audit log:', error);
    // Don't throw - we don't want audit logging failures to break the main flow
  }
}

// Convenience wrapper specifically for booking operations
export async function logBooking(params: {
  requestId?: string;
  agentId?: string;
  sourceId?: string;
  agreementRef?: string;
  operation: "create" | "cancel" | "modify" | "check";
  requestPayload?: any;
  responsePayload?: any;
  statusCode?: number; // http or grpc mapped
  grpcStatus?: number;
  durationMs?: number;
}) {
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