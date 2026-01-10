export class TransportException extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = 'TransportException';
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  public static fromHttp(error: unknown): TransportException {
    if (error instanceof Error) {
      const axiosError = error as { response?: { status?: number; data?: unknown }; code?: string };
      const statusCode = axiosError.response?.status;
      const message = axiosError.response?.data
        ? JSON.stringify(axiosError.response.data)
        : error.message;
      return new TransportException(message, statusCode, axiosError.code);
    }
    return new TransportException(String(error));
  }

  public static fromGrpc(error: unknown): TransportException {
    if (error instanceof Error) {
      const grpcError = error as { code?: number; details?: string };
      return new TransportException(
        grpcError.details || error.message,
        grpcError.code,
        String(grpcError.code)
      );
    }
    return new TransportException(String(error));
  }
}

