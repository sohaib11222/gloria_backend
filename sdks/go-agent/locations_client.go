package sdk

import (
	"context"
)

// LocationsClient provides location-related functionality
type LocationsClient struct {
	transport Transport
	config    *Config
}

// NewLocationsClient creates a new LocationsClient
func NewLocationsClient(transport Transport, config *Config) *LocationsClient {
	return &LocationsClient{
		transport: transport,
		config:    config,
	}
}

// IsSupported checks if a location is supported for a given agreement
func (lc *LocationsClient) IsSupported(ctx context.Context, agreementRef, locode string) (bool, error) {
	return lc.transport.IsLocationSupported(ctx, agreementRef, locode)
}

