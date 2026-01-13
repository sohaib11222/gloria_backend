package sdk

import (
	"fmt"
	"net/http"
)

// TransportException represents an error from the transport layer
type TransportException struct {
	Message    string
	StatusCode int
	Code       string
}

// Error implements the error interface
func (e *TransportException) Error() string {
	if e.StatusCode > 0 {
		return fmt.Sprintf("TransportException: %s (status: %d, code: %s)", e.Message, e.StatusCode, e.Code)
	}
	return fmt.Sprintf("TransportException: %s (code: %s)", e.Message, e.Code)
}

// FromHttp creates a TransportException from an HTTP error
func TransportExceptionFromHttp(err error, response *http.Response) *TransportException {
	if response != nil {
		return &TransportException{
			Message:    fmt.Sprintf("HTTP error: %s", err.Error()),
			StatusCode: response.StatusCode,
			Code:       http.StatusText(response.StatusCode),
		}
	}
	return &TransportException{
		Message:    err.Error(),
		StatusCode: 0,
		Code:       "HTTP_ERROR",
	}
}

// FromGrpc creates a TransportException from a gRPC error
func TransportExceptionFromGrpc(err error, grpcCode interface{}) *TransportException {
	code := ""
	if grpcCode != nil {
		code = fmt.Sprintf("%v", grpcCode)
	}
	return &TransportException{
		Message:    err.Error(),
		StatusCode: 0,
		Code:       code,
	}
}

// NewTransportException creates a new TransportException
func NewTransportException(message string, statusCode int, code string) *TransportException {
	return &TransportException{
		Message:    message,
		StatusCode: statusCode,
		Code:       code,
	}
}

