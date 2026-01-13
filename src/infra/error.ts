import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "./logger.js";

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const code = err?.status || 500;
  const requestId = (req as any).requestId;
  
  // Log the error for debugging
  logger.error({ 
    err, 
    errorMessage: err?.message, 
    errorCode: err?.code,
    stack: err?.stack,
    requestId,
    path: req.path,
    method: req.method
  }, "Request error");
  
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "SCHEMA_ERROR", details: err.issues, requestId });
  }
  
  // Handle Prisma database errors
  if (err?.code && err.code.startsWith('P')) {
    let statusCode = 500;
    let errorMessage = "Database error";
    
    // Check if the error message contains MySQL authentication errors
    const fullMessage = err.message || '';
    if (fullMessage.includes('Access denied') || 
        fullMessage.includes('ERROR 28000') || 
        fullMessage.includes('ERROR 1698')) {
      return res.status(503).json({
        error: "DATABASE_AUTH_ERROR",
        message: "Database authentication failed. Please check your DATABASE_URL in .env file and restart the server.",
        hint: "Format: mysql://username:password@host:port/database_name",
        solution: "1. Check your .env file has correct DATABASE_URL\n2. Restart the server: npm run dev\n3. Verify connection: npm run test:db",
        requestId
      });
    }
    
    // Prisma error codes
    if (err.code === 'P1000' || err.code === 'P1001') {
      statusCode = 503;
      errorMessage = "Database connection failed. Please check your DATABASE_URL configuration.";
    } else if (err.code === 'P2002') {
      statusCode = 409;
      errorMessage = "Duplicate entry";
    } else if (err.code === 'P2025') {
      statusCode = 404;
      errorMessage = "Record not found";
    } else {
      errorMessage = err.message || "Database operation failed";
    }
    
    return res.status(statusCode).json({ 
      error: "DATABASE_ERROR", 
      message: errorMessage,
      code: err.code,
      requestId 
    });
  }
  
  // Handle MySQL authentication errors (check both message and meta)
  const errorMessage = err?.message || '';
  const metaError = err?.meta?.message || '';
  const hasAccessDenied = errorMessage.includes('Access denied') || 
                          metaError.includes('Access denied') ||
                          errorMessage.includes('ERROR 28000') ||
                          errorMessage.includes('ERROR 1698');
  
  if (hasAccessDenied) {
    return res.status(503).json({
      error: "DATABASE_AUTH_ERROR",
      message: "Database authentication failed. Please check your DATABASE_URL in .env file and restart the server.",
      hint: "Format: mysql://username:password@host:port/database_name",
      solution: "1. Check your .env file has correct DATABASE_URL\n2. Restart the server: npm run dev\n3. Verify connection: npm run test:db",
      requestId
    });
  }
  
  // Handle SMTP/email connection errors separately from database errors
  if (errorMessage.includes('ECONNREFUSED') && errorMessage.includes('587')) {
    // This is an SMTP error, not a database error
    logger.warn({ err, requestId }, "SMTP connection failed - email service unavailable");
    // Don't return error here, let it be handled by the route or continue as 500
  }
  
  // Handle database connection errors (but not SMTP)
  if ((errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) && 
      !errorMessage.includes('587') && !errorMessage.includes('465') && !errorMessage.includes('25')) {
    return res.status(503).json({
      error: "DATABASE_CONNECTION_ERROR",
      message: "Cannot connect to database. Please ensure MySQL is running.",
      requestId
    });
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
  
  // In development, include more details
  const isDev = process.env.NODE_ENV !== 'production';
  const response: any = { 
    error: err.code || "INTERNAL_ERROR", 
    message,
    requestId 
  };
  
  if (isDev && err?.stack) {
    response.stack = err.stack;
  }
  
  res.status(statusCode).json(response);
}




