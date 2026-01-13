package sdk

import (
	"context"
)

// Client is the main SDK client
type Client struct {
	config    *Config
	transport Transport
}

// NewClient creates a new SDK client
func NewClient(config *Config) *Client {
	var transport Transport
	if config.IsGrpc() {
		transport = NewGrpcTransport(config)
	} else {
		transport = NewRestTransport(config)
	}

	return &Client{
		config:    config,
		transport: transport,
	}
}

// Availability returns the availability client
func (c *Client) Availability() *AvailabilityClient {
	return NewAvailabilityClient(c.transport, c.config)
}

// Booking returns the booking client
func (c *Client) Booking() *BookingClient {
	return NewBookingClient(c.transport, c.config)
}

// Locations returns the locations client
func (c *Client) Locations() *LocationsClient {
	return NewLocationsClient(c.transport, c.config)
}

// Transport interface for REST and gRPC
type Transport interface {
	AvailabilitySubmit(ctx context.Context, criteria map[string]interface{}) (map[string]interface{}, error)
	AvailabilityPoll(ctx context.Context, requestID string, sinceSeq int, waitMs int) (map[string]interface{}, error)
	IsLocationSupported(ctx context.Context, agreementRef, locode string) (bool, error)
	BookingCreate(ctx context.Context, payload map[string]interface{}, idempotencyKey string) (map[string]interface{}, error)
	BookingModify(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error)
	BookingCancel(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error)
	BookingCheck(ctx context.Context, supplierBookingRef, agreementRef, sourceID string) (map[string]interface{}, error)
}

