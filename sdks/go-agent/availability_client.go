package sdk

import (
	"context"
	"fmt"
	"time"
)

// AvailabilityClient provides availability search functionality
type AvailabilityClient struct {
	transport Transport
	config    *Config
}

// NewAvailabilityClient creates a new AvailabilityClient
func NewAvailabilityClient(transport Transport, config *Config) *AvailabilityClient {
	return &AvailabilityClient{
		transport: transport,
		config:    config,
	}
}

// SearchResult represents a single chunk from the search stream
type SearchResult struct {
	Chunk *AvailabilityChunk
	Error error
}

// Search performs an availability search and returns results via a channel
// This follows Go idioms for async iteration using channels
func (ac *AvailabilityClient) Search(ctx context.Context, criteria *AvailabilityCriteria) (<-chan *SearchResult, error) {
	// Validate criteria
	if len(criteria.AgreementRefs) == 0 {
		return nil, fmt.Errorf("agreement_refs required")
	}

	// Convert criteria to map
	payload := criteria.ToMap()

	// Submit request
	submitResult, err := ac.transport.AvailabilitySubmit(ctx, payload)
	if err != nil {
		return nil, err
	}

	// Extract request ID
	requestID, ok := submitResult["request_id"].(string)
	if !ok {
		// No request ID means nothing to poll
		resultChan := make(chan *SearchResult, 1)
		close(resultChan)
		return resultChan, nil
	}

	// Create channel for results
	resultChan := make(chan *SearchResult, 1)

	// Start polling in goroutine
	go ac.pollUntilComplete(ctx, requestID, resultChan)

	return resultChan, nil
}

// pollUntilComplete polls for results until complete or deadline
func (ac *AvailabilityClient) pollUntilComplete(ctx context.Context, requestID string, resultChan chan<- *SearchResult) {
	defer close(resultChan)

	since := 0
	slaMs := ac.config.GetInt("availabilitySlaMs", 120000)
	deadline := time.Now().Add(time.Duration(slaMs) * time.Millisecond)

	for {
		// Check deadline
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return
		}

		// Calculate wait time
		longPollWaitMs := ac.config.GetInt("longPollWaitMs", 10000)
		waitMs := int(remaining.Milliseconds())
		if waitMs > longPollWaitMs {
			waitMs = longPollWaitMs
		}

		// Poll for results
		res, err := ac.transport.AvailabilityPoll(ctx, requestID, since, waitMs)
		if err != nil {
			resultChan <- &SearchResult{Error: err}
			return
		}

		// Parse chunk
		chunk := AvailabilityChunkFromMap(res)

		// Update cursor
		if chunk.Cursor != nil {
			since = *chunk.Cursor
		}

		// Send chunk
		resultChan <- &SearchResult{Chunk: chunk}

		// Check if complete
		if chunk.Status == "COMPLETE" {
			return
		}
	}
}

