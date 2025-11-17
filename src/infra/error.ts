import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const code = err?.status || 500;
  const requestId = (req as any).requestId;
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "SCHEMA_ERROR", details: err.issues, requestId });
  }
  
  // Map gRPC status codes to HTTP status codes
  // gRPC codes: 0=OK, 1=CANCELLED, 2=UNKNOWN, 3=INVALID_ARGUMENT, 4=DEADLINE_EXCEEDED, 
  // 5=NOT_FOUND, 6=ALREADY_EXISTS, 7=PERMISSION_DENIED, 8=RESOURCE_EXHAUSTED, 
  // 9=FAILED_PRECONDITION, 10=ABORTED, 11=OUT_OF_RANGE, 12=UNIMPLEMENTED, 
  // 13=INTERNAL, 14=UNAVAILABLE, 15=DATA_LOSS, 16=UNAUTHENTICATED
  const grpcToHttpMap: Record<number, number> = {
    1: 499,  // CANCELLED -> 499 Client Closed Request
    2: 500,  // UNKNOWN -> 500 Internal Server Error
    3: 400,  // INVALID_ARGUMENT -> 400 Bad Request
    4: 504,  // DEADLINE_EXCEEDED -> 504 Gateway Timeout
    5: 404,  // NOT_FOUND -> 404 Not Found
    6: 409,  // ALREADY_EXISTS -> 409 Conflict
    7: 403,  // PERMISSION_DENIED -> 403 Forbidden
    8: 429,  // RESOURCE_EXHAUSTED -> 429 Too Many Requests
    9: 400,  // FAILED_PRECONDITION -> 400 Bad Request
    10: 409, // ABORTED -> 409 Conflict
    11: 400, // OUT_OF_RANGE -> 400 Bad Request
    12: 501, // UNIMPLEMENTED -> 501 Not Implemented
    13: 500, // INTERNAL -> 500 Internal Server Error
    14: 503, // UNAVAILABLE -> 503 Service Unavailable
    15: 500, // DATA_LOSS -> 500 Internal Server Error
    16: 401, // UNAUTHENTICATED -> 401 Unauthorized
  };
  
  const statusCode = err?.code !== undefined && grpcToHttpMap[err.code] !== undefined 
    ? grpcToHttpMap[err.code] 
    : code;
  
  const message = err?.message || "Internal Server Error";
  res.status(statusCode).json({ error: err.code || "INTERNAL_ERROR", message, requestId });
}




