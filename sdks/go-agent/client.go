package sdk

import (
	"context"
	"net/http"
)

// Config holds SDK configuration
type Config struct {
	// REST Configuration
	BaseURL string
	Token   string
	APIKey  string
	
	// gRPC Configuration
	Host       string
	CACert     string
	ClientCert string
	ClientKey  string
	
	// Common
	AgentID           string
	CallTimeoutMs     int
	AvailabilitySlaMs int
	LongPollWaitMs    int
	CorrelationID     string
}

// Client is the main SDK client
type Client struct {
	config     Config
	httpClient *http.Client
	transport  Transport
}

// NewClient creates a new SDK client with REST transport
func NewClient(config Config) *Client {
	return &Client{
		config:     config,
		httpClient: &http.Client{},
		transport:  NewRestTransport(config),
	}
}

// Availability returns the availability client
func (c *Client) Availability() *AvailabilityClient {
	return NewAvailabilityClient(c.transport)
}

// Booking returns the booking client
func (c *Client) Booking() *BookingClient {
	return NewBookingClient(c.transport)
}

// Locations returns the locations client
func (c *Client) Locations() *LocationsClient {
	return NewLocationsClient(c.transport)
}

// Transport interface for REST and gRPC
type Transport interface {
	SubmitAvailability(ctx context.Context, criteria AvailabilityCriteria) (string, error)
	PollAvailability(ctx context.Context, requestID string, sinceSeq int, waitMs int) (*AvailabilityChunk, error)
	CreateBooking(ctx context.Context, booking BookingCreate, idempotencyKey string) (*BookingResult, error)
	ModifyBooking(ctx context.Context, bookingRef string, agreementRef string, idempotencyKey string) (*BookingResult, error)
	CancelBooking(ctx context.Context, bookingRef string, agreementRef string, idempotencyKey string) (*BookingResult, error)
	CheckBooking(ctx context.Context, bookingRef string, agreementRef string) (*BookingResult, error)
	GetLocations(ctx context.Context) ([]Location, error)
}

