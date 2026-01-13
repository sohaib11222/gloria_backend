package sdk

import (
	"context"
	"fmt"
)

// GrpcTransport implements gRPC transport (stub implementation)
// Note: Full gRPC implementation requires proto file generation from backend protos
type GrpcTransport struct {
	config *Config
}

// NewGrpcTransport creates a new gRPC transport
func NewGrpcTransport(config *Config) *GrpcTransport {
	return &GrpcTransport{
		config: config,
	}
}

// AvailabilitySubmit submits an availability request via gRPC
func (gt *GrpcTransport) AvailabilitySubmit(ctx context.Context, criteria map[string]interface{}) (map[string]interface{}, error) {
	return nil, fmt.Errorf("gRPC transport not yet implemented - requires proto file generation from backend protos")
}

// AvailabilityPoll polls for availability results via gRPC
func (gt *GrpcTransport) AvailabilityPoll(ctx context.Context, requestID string, sinceSeq int, waitMs int) (map[string]interface{}, error) {
	return nil, fmt.Errorf("gRPC transport not yet implemented - requires proto file generation from backend protos")
}

// IsLocationSupported checks if a location is supported via gRPC
func (gt *GrpcTransport) IsLocationSupported(ctx context.Context, agreementRef, locode string) (bool, error) {
	return false, fmt.Errorf("gRPC transport not yet implemented - requires proto file generation from backend protos")
}

// BookingCreate creates a booking via gRPC
func (gt *GrpcTransport) BookingCreate(ctx context.Context, payload map[string]interface{}, idempotencyKey string) (map[string]interface{}, error) {
	return nil, fmt.Errorf("gRPC transport not yet implemented - requires proto file generation from backend protos")
}

// BookingModify modifies a booking via gRPC
func (gt *GrpcTransport) BookingModify(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	return nil, fmt.Errorf("gRPC transport not yet implemented - requires proto file generation from backend protos")
}

// BookingCancel cancels a booking via gRPC
func (gt *GrpcTransport) BookingCancel(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	return nil, fmt.Errorf("gRPC transport not yet implemented - requires proto file generation from backend protos")
}

// BookingCheck checks a booking status via gRPC
func (gt *GrpcTransport) BookingCheck(ctx context.Context, supplierBookingRef, agreementRef, sourceID string) (map[string]interface{}, error) {
	return nil, fmt.Errorf("gRPC transport not yet implemented - requires proto file generation from backend protos")
}

