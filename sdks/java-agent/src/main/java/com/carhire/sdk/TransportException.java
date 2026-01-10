package com.carhire.sdk;

public class TransportException extends Exception {
    private final Integer statusCode;
    private final String code;

    public TransportException(String message) {
        super(message);
        this.statusCode = null;
        this.code = null;
    }

    public TransportException(String message, Integer statusCode, String code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }

    public Integer getStatusCode() {
        return statusCode;
    }

    public String getCode() {
        return code;
    }

    public static TransportException fromHttp(Exception error) {
        // Extract status code and message from HTTP error
        String message = error.getMessage();
        Integer statusCode = null;
        String code = null;

        if (error instanceof okhttp3.HttpException) {
            okhttp3.HttpException httpError = (okhttp3.HttpException) error;
            statusCode = httpError.code();
            message = httpError.message();
        }

        return new TransportException(message, statusCode, code);
    }

    public static TransportException fromGrpc(Exception error) {
        String message = error.getMessage();
        String code = null;

        if (error instanceof io.grpc.StatusException) {
            io.grpc.StatusException grpcError = (io.grpc.StatusException) error;
            code = grpcError.getStatus().getCode().toString();
            message = grpcError.getStatus().getDescription();
        }

        return new TransportException(message, null, code);
    }
}

